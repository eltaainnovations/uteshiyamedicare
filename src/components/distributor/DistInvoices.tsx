import { Download, FileText, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { downloadInvoicePdf, fetchPortalInvoices, type PortalInvoice, type PortalInvoiceStats } from '../../api/portalApi'
import { ApiError } from '../../types/auth'
import { formatInr } from '../../utils/currency'

// Real ERPNext Sales Invoice statuses confirmed live on this instance:
// Draft / Overdue / Cancelled / Return. Paid/Unpaid aren't present in
// current data but are standard ERPNext values, so they're styled here
// too in case a future invoice actually reaches them — the text shown
// is always whatever ERPNext returns, never relabeled.
const STATUS_STYLE: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Overdue: 'bg-red-100 text-red-700',
  Cancelled: 'bg-gray-100 text-gray-500',
  Return: 'bg-purple-100 text-purple-700',
  Paid: 'bg-green-100 text-green-700',
  Unpaid: 'bg-amber-100 text-amber-700',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function DistInvoices() {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([])
  const [stats, setStats] = useState<PortalInvoiceStats>({ totalInvoiced: 0, pending: 0, overdue: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPortalInvoices()
      .then((data) => {
        if (cancelled) return
        setInvoices(data.items)
        setStats(data.stats)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load invoices.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.salesOrder ?? '').toLowerCase().includes(q),
    )
  }, [invoices, search])

  async function handleDownload(invoice: PortalInvoice) {
    if (!invoice.salesOrder) return
    setDownloading(invoice.name)
    setDownloadError(null)
    try {
      await downloadInvoicePdf(invoice.salesOrder)
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : 'Could not download the invoice.')
    } finally {
      setDownloading(null)
    }
  }

  const kpis = [
    { label: 'Total Invoiced', value: formatInr(stats.totalInvoiced), color: '#147BA6' },
    { label: 'Pending', value: formatInr(stats.pending), color: '#F59E0B' },
    { label: 'Overdue', value: formatInr(stats.overdue), color: '#DC2626' },
  ]

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Invoices</h2>
        <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">Your Sales Invoices from ERPNext</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {kpis.map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm text-center"
          >
            <p className="text-lg font-bold" style={{ color }}>
              {loading ? '…' : value}
            </p>
            <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice # or order #..."
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>
      </div>

      {downloadError && (
        <p className="text-xs text-red-600 bg-red-50 dark:bg-[rgba(220,38,38,0.1)] rounded-[8px] px-3 py-2">
          {downloadError}
        </p>
      )}

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                {['Invoice #', 'Order #', 'GST No.', 'Date', 'Amount', 'Status', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#5A6075] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-[#252836]">
              {error ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-400 dark:text-[#5A6075]">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-400 dark:text-[#5A6075]">
                    {invoices.length === 0 ? 'No invoices yet.' : 'No invoices match your search.'}
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr key={inv.name} className="hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-gray-400 dark:text-[#5A6075]" />
                        <span className="text-xs font-semibold text-[#147BA6]">{inv.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-mono text-gray-700 dark:text-[#C4C9D8] whitespace-nowrap">
                      {inv.salesOrder ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-mono text-gray-500 dark:text-[#8892A4] whitespace-nowrap">
                      {inv.gstin ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-[#96A0B4] whitespace-nowrap">
                      {formatDate(inv.postingDate)}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-bold text-gray-900 dark:text-[#E8EAF0] whitespace-nowrap">
                      {formatInr(inv.grandTotal)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[inv.status] ?? 'bg-gray-100 text-gray-600 dark:bg-[#252836] dark:text-[#8892A4]'}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => handleDownload(inv)}
                        disabled={!inv.salesOrder || downloading === inv.name}
                        title={inv.salesOrder ? 'Download PDF' : 'No linked order to download from'}
                        className={`w-7 h-7 flex items-center justify-center rounded-[6px] transition disabled:opacity-60 ${
                          inv.salesOrder
                            ? 'text-gray-400 hover:text-[#147BA6] hover:bg-blue-50 dark:hover:bg-[rgba(20,123,166,0.15)]'
                            : 'text-gray-300 dark:text-[#3A3F52] cursor-not-allowed'
                        }`}
                      >
                        <Download size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
