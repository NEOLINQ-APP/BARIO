// Real Google Ads API v25 REST calls -- pushes a bo_ad_campaigns draft into
// an actually-existing campaign in the connected Google Ads account.
//
// UNTESTED against a live account as of writing: the connected developer
// token is still on Test Account access (Basic Access application pending
// per the user), which can only write to Google's own fake test accounts,
// not a real one like AFC's. The first real push attempt is the real test
// of this file -- expect Google's response to demand adjustments, and
// report exactly what Google says back rather than guessing silently.
import { decryptPassword } from './vpsPassword'

const API_VERSION = 'v25'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

type AdCampaign = {
  id: string
  name: string
  headline: string | null
  description: string | null
  headlines_json: string
  descriptions_json: string
  keywords_json: string
  daily_budget_cents: number | null
  final_url: string | null
}

type Connection = {
  organization_id: string
  google_ads_customer_id: string | null
  refresh_token_ciphertext: string
  refresh_token_iv: string
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('GOOGLE_ADS_CLIENT_ID/SECRET not set')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

function adsHeaders(accessToken: string, loginCustomerId: string) {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!devToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN not set')
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${accessToken}`,
    'developer-token': devToken,
    'login-customer-id': loginCustomerId.replace(/-/g, ''),
  }
}

// Discovers which real Google Ads account(s) this OAuth grant can reach.
// Called once per connection, first time a push is attempted -- there's no
// way to know the customer ID before the user has actually connected.
async function listAccessibleCustomerId(accessToken: string, devToken: string): Promise<string> {
  const res = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`, {
    headers: { authorization: `Bearer ${accessToken}`, 'developer-token': devToken },
  })
  if (!res.ok) throw new Error(`listAccessibleCustomers failed (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as { resourceNames?: string[] }
  const first = data.resourceNames?.[0] // "customers/1234567890"
  if (!first) throw new Error('No Google Ads accounts are accessible to this connection')
  return first.split('/')[1]
}

export async function pushCampaignToGoogleAds(
  sql: any,
  campaign: AdCampaign,
  connection: Connection
): Promise<{ ok: true; googleAdsCampaignId: string } | { ok: false; error: string }> {
  try {
    const refreshToken = decryptPassword(connection.refresh_token_ciphertext, connection.refresh_token_iv)
    const accessToken = await refreshAccessToken(refreshToken)
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    if (!devToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN not set')

    let customerId = connection.google_ads_customer_id
    if (!customerId) {
      customerId = await listAccessibleCustomerId(accessToken, devToken)
      await sql`UPDATE bo_google_ads_connections SET google_ads_customer_id = ${customerId} WHERE organization_id = ${connection.organization_id}`
    }

    const headlines: string[] = JSON.parse(campaign.headlines_json || '[]')
    const descriptions: string[] = JSON.parse(campaign.descriptions_json || '[]')
    const keywords: string[] = JSON.parse(campaign.keywords_json || '[]')
    const allHeadlines = headlines.length >= 3 ? headlines : [...headlines, ...(campaign.headline ? [campaign.headline] : [])].slice(0, 3)
    const allDescriptions = descriptions.length >= 2 ? descriptions : [...descriptions, ...(campaign.description ? [campaign.description] : [])].slice(0, 2)
    if (allHeadlines.length < 3 || allDescriptions.length < 2) {
      return { ok: false, error: 'Needs at least 3 headlines and 2 descriptions before it can be pushed (Google requires this many for a Responsive Search Ad)' }
    }
    if (!campaign.final_url) return { ok: false, error: 'Needs a landing page URL before it can be pushed' }
    if (!campaign.daily_budget_cents) return { ok: false, error: 'Needs a daily budget before it can be pushed' }

    const microsPerDay = campaign.daily_budget_cents * 10_000 // cents -> micros (1 unit = 1,000,000 micros; 1 cent = 10,000 micros)

    const body = {
      mutateOperations: [
        {
          campaignBudgetOperation: {
            create: {
              resourceName: `customers/${customerId}/campaignBudgets/-1`,
              name: `${campaign.name} — Budget`,
              deliveryMethod: 'STANDARD',
              amountMicros: String(microsPerDay),
            },
          },
        },
        {
          campaignOperation: {
            create: {
              resourceName: `customers/${customerId}/campaigns/-2`,
              // PAUSED, always -- a real human at Bario/the client enables
              // it deliberately once they've reviewed it; this code should
              // never be the thing that starts real ad spend on its own.
              status: 'PAUSED',
              advertisingChannelType: 'SEARCH',
              name: campaign.name,
              campaignBudget: `customers/${customerId}/campaignBudgets/-1`,
            },
          },
        },
        {
          adGroupOperation: {
            create: {
              resourceName: `customers/${customerId}/adGroups/-3`,
              campaign: `customers/${customerId}/campaigns/-2`,
              name: `${campaign.name} — Ad Group`,
              status: 'PAUSED',
              type: 'SEARCH_STANDARD',
            },
          },
        },
        {
          adGroupAdOperation: {
            create: {
              adGroup: `customers/${customerId}/adGroups/-3`,
              status: 'PAUSED',
              ad: {
                responsiveSearchAd: {
                  headlines: allHeadlines.map((text) => ({ text })),
                  descriptions: allDescriptions.map((text) => ({ text })),
                },
                finalUrls: [campaign.final_url],
              },
            },
          },
        },
        ...keywords.map((keyword) => ({
          adGroupCriterionOperation: {
            create: {
              adGroup: `customers/${customerId}/adGroups/-3`,
              status: 'ENABLED',
              keyword: { text: keyword, matchType: 'BROAD' },
            },
          },
        })),
      ],
    }

    const res = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:mutate`, {
      method: 'POST',
      headers: adsHeaders(accessToken, customerId),
      body: JSON.stringify(body),
    })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, error: `Google Ads rejected this (${res.status}): ${text.slice(0, 500)}` }
    }
    const data = JSON.parse(text) as { mutateOperationResponses?: { campaignResult?: { resourceName: string } }[] }
    const campaignResourceName = data.mutateOperationResponses?.find((r) => r.campaignResult)?.campaignResult?.resourceName
    const googleAdsCampaignId = campaignResourceName?.split('/').pop() || 'unknown'

    await sql`
      UPDATE bo_ad_campaigns SET
        status = 'pushed', google_ads_campaign_id = ${googleAdsCampaignId}, google_ads_account_id = ${customerId},
        push_error = NULL, pushed_at = now(), updated_at = now()
      WHERE id = ${campaign.id}
    `
    return { ok: true, googleAdsCampaignId }
  } catch (err: any) {
    const message = err?.message || 'Unknown error pushing to Google Ads'
    await sql`UPDATE bo_ad_campaigns SET status = 'error', push_error = ${message}, updated_at = now() WHERE id = ${campaign.id}`
    return { ok: false, error: message }
  }
}
