import PublicInvoice from '@/components/PublicInvoice'

export const dynamic = 'force-dynamic'

export default function PublicInvoicePage({ params }: { params: { token: string } }) {
  return <PublicInvoice token={params.token} />
}
