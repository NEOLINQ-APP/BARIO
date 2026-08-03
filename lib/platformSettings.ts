export async function getSetting(sql: any, key: string): Promise<string | null> {
  const rows = (await sql`SELECT value FROM platform_settings WHERE key = ${key}`) as unknown as { value: string }[]
  return rows[0]?.value ?? null
}

export async function setSetting(sql: any, key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO platform_settings (key, value, updated_at) VALUES (${key}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = now()
  `
}

export type EmployerInfo = { name: string; address: string; businessNumber: string }

export async function getEmployerInfo(sql: any): Promise<EmployerInfo> {
  const [name, address, businessNumber] = await Promise.all([
    getSetting(sql, 'employer_name'),
    getSetting(sql, 'employer_address'),
    getSetting(sql, 'employer_business_number'),
  ])
  return { name: name ?? 'Bario', address: address ?? '', businessNumber: businessNumber ?? '' }
}

export async function getDocumentLogoUrl(sql: any): Promise<string> {
  const custom = await getSetting(sql, 'document_logo_url')
  return custom ?? 'https://www.bario.ca/bario-icon-64.png'
}
