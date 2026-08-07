import BarioOnePublicInvoice from '@/components/BarioOnePublicInvoice'

export const dynamic = 'force-dynamic'

export default function BoInvoicePage({ params }: { params: { token: string } }) {
  return <BarioOnePublicInvoice token={params.token} />
}
