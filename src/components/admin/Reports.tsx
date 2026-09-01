import { ChevronDown, Package, ShoppingCart, TrendingUp, Users, X } from 'lucide-react'
import { useState } from 'react'
import { generateReport, type ReportType } from '../../api/reportsApi'
import { ApiError } from '../../types/auth'

interface Category {
  icon: typeof TrendingUp
  label: string
  desc: string
  color: string
  bg: string
  reportType: ReportType
}

const CATEGORIES: Category[] = [
  {
    icon: TrendingUp,
    label: 'Sales & Revenue Report',
    desc: 'Order value by date, with a totals row',
    color: '#147BA6',
    bg: '#e8f4fa',
    reportType: 'sales',
  },
  {
    icon: ShoppingCart,
    label: 'Order Report',
    desc: 'Every order in range — same columns as the Orders screen',
    color: '#1F8A70',
    bg: '#e6f5f1',
    reportType: 'orders',
  },
  {
    icon: Package,
    label: 'Top Products Report',
    desc: 'Top 10 products by revenue in range',
    color: '#7C3AED',
    bg: '#F5F3FF',
    reportType: 'top_products',
  },
  {
    icon: Users,
    label: 'Distributor Performance Report',
    desc: 'Order count and total value per distributor',
    color: '#4AA3FF',
    bg: '#EFF6FF',
    reportType: 'distributor_performance',
  },
]

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultFromDate(): string {
  const d = new Date()
  d.setDate(1)
  return isoDate(d)
}

function defaultToDate(): string {
  return isoDate(new Date())
}

export default function Reports() {
  const [showModal, setShowModal] = useState(false)
  const [reportType, setReportType] = useState<ReportType>('sales')
  const [fromDate, setFromDate] = useState(defaultFromDate())
  const [toDate, setToDate] = useState(defaultToDate())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectCls =
    'appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition cursor-pointer'
  const inputCls =
    'w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition'

  function openModal(type: ReportType) {
    setReportType(type)
    setError(null)
    setShowModal(true)
  }

  function closeModal() {
    if (generating) return
    setShowModal(false)
  }

  function handleGenerate() {
    setError(null)
    setGenerating(true)
    generateReport(reportType, fromDate, toDate)
      .then(() => setShowModal(false))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not generate this report. Please try again.')
      })
      .finally(() => setGenerating(false))
  }

  return (
    <div className="p-5 lg:p-7 space-y-7">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Reports</h2>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
            Generate and download Excel reports for a date range
          </p>
        </div>
      </div>

      <section>
        <p className="text-xs font-semibold text-gray-500 dark:text-[#5A6075] uppercase tracking-wider mb-3">
          Report Categories
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {CATEGORIES.map(({ icon: Icon, label, desc, color, bg, reportType: type }) => (
            <button
              key={label}
              onClick={() => openModal(type)}
              className="group bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-5 text-left hover:shadow-md hover:border-[#147BA6] dark:hover:border-[#147BA6] transition-all"
            >
              <div
                className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-4 transition-transform group-hover:scale-105"
                style={{ background: bg }}
              >
                <Icon size={20} style={{ color }} />
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] group-hover:text-[#147BA6] transition-colors leading-snug">
                {label}
              </p>
              <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-1 leading-relaxed">{desc}</p>
            </button>
          ))}
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[16px] w-full max-w-md shadow-2xl border border-transparent dark:border-[#252836]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-[#252836]">
              <h3 className="text-base font-semibold text-gray-900 dark:text-[#E8EAF0]">Generate Report</h3>
              <button
                onClick={closeModal}
                disabled={generating}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-[#96A0B4] transition disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {error && (
                <p className="px-3 py-2 rounded-[8px] bg-red-50 border border-red-200 text-red-700 text-xs">
                  {error}
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-[#96A0B4] mb-1.5">
                  Report Type
                </label>
                <div className="relative">
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as ReportType)}
                    disabled={generating}
                    className={`w-full ${selectCls}`}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.reportType} value={c.reportType}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-[#96A0B4] mb-1.5">From Date</label>
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    disabled={generating}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-[#96A0B4] mb-1.5">To Date</label>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate}
                    onChange={(e) => setToDate(e.target.value)}
                    disabled={generating}
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-[#252836]">
              <button
                onClick={closeModal}
                disabled={generating}
                className="flex-1 py-2.5 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] text-gray-600 dark:text-[#96A0B4] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 py-2.5 text-sm text-white rounded-[8px] font-semibold transition hover:brightness-95 disabled:opacity-70"
                style={{ background: '#147BA6' }}
              >
                {generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
