# bario.ca – Nexus Build

Next.js 14 + Tailwind, ready for Vercel.

## Deploy
1. Push this folder to GitHub
2. vercel.com → Add New → Project → Import Git Repository
3. Copy `.env.example` to Vercel's Environment Variables and fill in real values
   (Postgres, Stripe, OpenAI, Resend, Vercel API token, Sentry — see that file
   for the full list and what each one is for)
4. Deploy

Local dev:
```
cp .env.example .env.local   # then fill in values
npm install
npm run dev
```

Contact: hello@bario.ca
