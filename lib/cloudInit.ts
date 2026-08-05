// Cloud-init passed as user_data at server creation. SSH key injection goes
// through Hetzner's native ssh_keys param on createServer, not through here
// — this only handles hostname + enabling automatic security patching by
// default, so a customer who never logs in isn't silently running unpatched
// software, plus (for 'wordpress' app_type) a real, working WordPress stack.

function indentBlock(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.length ? pad + line : pad))
    .join('\n')
}

export function buildUserData(opts: { hostname: string }): string {
  return `#cloud-config
hostname: ${opts.hostname}
package_update: true
package_upgrade: true
packages:
  - unattended-upgrades
write_files:
  - path: /etc/apt/apt.conf.d/20auto-upgrades
    content: |
      APT::Periodic::Update-Package-Lists "1";
      APT::Periodic::Unattended-Upgrade "1";
runcmd:
  - systemctl enable --now unattended-upgrades
`
}

// One-click "WordPress on your own VPS" (Product A). All secrets
// (wpDbPassword/wpAdminPassword) are generated server-side per order in
// lib/vpsProvision.ts and baked directly into these files as literal values
// — there's no separate .env file or runtime templating on the box itself.
// The box only ever serves ONE WordPress site for ONE customer, which is
// what keeps the nginx/cert story simple (no per-tenant routing needed —
// that complexity is scoped to the future shared-hosting tier instead).
export function buildWordPressUserData(opts: {
  hostname: string
  wpDbPassword: string
  wpAdminUser: string
  wpAdminPassword: string
  wpAdminEmail: string
  // Only set when the customer chose the password-fallback option instead
  // of supplying their own SSH key. Hetzner only returns a root password
  // when zero ssh_keys are attached to the server — but every 'wordpress'
  // app_type box always gets Bario's own management key attached (so the
  // "Issue HTTPS certificate" action can SSH in), which would otherwise
  // silently leave a password-fallback customer with no way into their own
  // box. Setting it via chpasswd here is independent of Hetzner's own
  // root_password field.
  rootPassword?: string
}): string {
  const dockerCompose = `services:
  db:
    image: mariadb:11
    restart: unless-stopped
    environment:
      MARIADB_ROOT_PASSWORD: "${opts.wpDbPassword}"
      MARIADB_DATABASE: wordpress
      MARIADB_USER: wordpress
      MARIADB_PASSWORD: "${opts.wpDbPassword}"
    volumes:
      - db_data:/var/lib/mysql
  wordpress:
    image: wordpress:php8.3-apache
    restart: unless-stopped
    depends_on:
      - db
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: "${opts.wpDbPassword}"
    volumes:
      - wp_data:/var/www/html
  wpcli:
    image: wordpress:cli-php8.3
    depends_on:
      - db
      - wordpress
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: "${opts.wpDbPassword}"
    volumes:
      - wp_data:/var/www/html
  certbot:
    image: certbot/certbot
    volumes:
      - certbot_www:/var/www/certbot
      - letsencrypt:/etc/letsencrypt
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    depends_on:
      - wordpress
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /root/wordpress/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /root/wordpress/nginx/conf.d:/etc/nginx/conf.d:ro
      - certbot_www:/var/www/certbot
      - letsencrypt:/etc/letsencrypt
volumes:
  db_data:
  wp_data:
  certbot_www:
  letsencrypt:
`

  const nginxConf = `events { worker_connections 1024; }
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  client_max_body_size 64m;
  include /etc/nginx/conf.d/*.conf;
}
`

  const nginxDefaultConf = `server {
  listen 80 default_server;
  server_name _;

  location /.well-known/acme-challenge/ {
    root /var/www/certbot;
  }

  location / {
    proxy_pass http://wordpress:80;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
`

  // Overwritten by issue-cert.sh once a real domain has a cert — empty
  // (comment-only) until then, since a bare 'include conf.d/*.conf' can't
  // tolerate a missing/malformed file.
  const nginxSslActiveConf = `# No HTTPS server configured yet — see /root/wordpress/issue-cert.sh
`

  const issueCertSh = `#!/bin/bash
set -e
DOMAIN="$1"
if [ -z "$DOMAIN" ]; then
  echo "Usage: issue-cert.sh <domain>" >&2
  exit 1
fi

cd /root/wordpress

docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d \${DOMAIN} --email admin@bario.ca --agree-tos --non-interactive

cat > /root/wordpress/nginx/conf.d/ssl-active.conf <<CERTEOF
server {
  listen 443 ssl;
  server_name \${DOMAIN};
  ssl_certificate /etc/letsencrypt/live/\${DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/\${DOMAIN}/privkey.pem;

  location / {
    proxy_pass http://wordpress:80;
    proxy_set_header Host \\$host;
    proxy_set_header X-Real-IP \\$remote_addr;
    proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
CERTEOF

docker compose exec nginx nginx -s reload

docker compose run --rm wpcli wp option update siteurl "https://\${DOMAIN}" --allow-root
docker compose run --rm wpcli wp option update home "https://\${DOMAIN}" --allow-root

echo "OK: certificate issued and WordPress reconfigured for https://\${DOMAIN}"
`

  const bootstrapSh = `#!/bin/bash
set -e
cd /root/wordpress

if docker compose run --rm wpcli wp core is-installed --allow-root >/dev/null 2>&1; then
  echo "WordPress already installed, skipping bootstrap."
  exit 0
fi

PUBLIC_IP=$(curl -s -4 ifconfig.me || curl -s -4 icanhazip.com)
SITE_URL="http://\${PUBLIC_IP}"

# MariaDB can take a while to accept real connections on first boot even
# after its container reports "running" — and WordPress's own DB-error page
# doesn't reliably fail an HTTP check, so retrying the actual install
# command (rather than a separate readiness probe) is what genuinely proves
# the DB is ready. wp-cli exits non-zero on a DB connection failure, so this
# loop only stops once install has truly succeeded.
for i in $(seq 1 30); do
  if docker compose run --rm wpcli wp core install \\
    --url="\${SITE_URL}" \\
    --title="My WordPress Site" \\
    --admin_user="${opts.wpAdminUser}" \\
    --admin_password="${opts.wpAdminPassword}" \\
    --admin_email="${opts.wpAdminEmail}" \\
    --skip-email \\
    --allow-root; then
    echo "WordPress installed at \${SITE_URL}"
    exit 0
  fi
  echo "wp core install attempt $i failed (database likely still starting) — retrying in 5s"
  sleep 5
done

echo "wp core install did not succeed after repeated attempts" >&2
exit 1
`

  const systemdUnit = `[Unit]
Description=Bario WordPress stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/wordpress
ExecStart=/usr/bin/docker compose up -d
ExecStartPost=/root/wordpress/bootstrap.sh
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
`

  const passwordDirectives = opts.rootPassword
    ? `chpasswd:
  list: |
    root:${opts.rootPassword}
  expire: false
ssh_pwauth: true
`
    : ''

  return `#cloud-config
hostname: ${opts.hostname}
package_update: true
package_upgrade: true
${passwordDirectives}packages:
  - unattended-upgrades
  - docker.io
  - docker-compose-v2
write_files:
  - path: /root/wordpress/docker-compose.yml
    content: |
${indentBlock(dockerCompose, 6)}
  - path: /root/wordpress/nginx/nginx.conf
    content: |
${indentBlock(nginxConf, 6)}
  - path: /root/wordpress/nginx/conf.d/default.conf
    content: |
${indentBlock(nginxDefaultConf, 6)}
  - path: /root/wordpress/nginx/conf.d/ssl-active.conf
    content: |
${indentBlock(nginxSslActiveConf, 6)}
  - path: /root/wordpress/issue-cert.sh
    permissions: '0700'
    content: |
${indentBlock(issueCertSh, 6)}
  - path: /root/wordpress/bootstrap.sh
    permissions: '0700'
    content: |
${indentBlock(bootstrapSh, 6)}
  - path: /etc/systemd/system/bario-wordpress.service
    content: |
${indentBlock(systemdUnit, 6)}
  - path: /etc/apt/apt.conf.d/20auto-upgrades
    content: |
      APT::Periodic::Update-Package-Lists "1";
      APT::Periodic::Unattended-Upgrade "1";
runcmd:
  - systemctl enable --now unattended-upgrades
  - systemctl enable --now docker
  - systemctl daemon-reload
  - systemctl enable --now bario-wordpress.service
`
}
