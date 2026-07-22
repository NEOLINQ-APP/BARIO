// Google's OAuth2 access tokens expire hourly, so we exchange the stored
// (long-lived) refresh token for a fresh access token on every publish call.
async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_BUSINESS_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || 'Failed to refresh Google access token')
  return data.access_token
}

export async function postToGoogleBusiness(content: string): Promise<string> {
  const accessToken = await getAccessToken()
  const accountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID!
  const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID!

  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ languageCode: 'en-US', summary: content, topicType: 'STANDARD' }),
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to post to Google Business Profile')
  return data.name
}
