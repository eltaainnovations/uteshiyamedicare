import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  MapPin,
  RefreshCw,
  Search,
  Star,
  User,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  fetchAdminEndUserRecords,
  type EndUserDistributorOption,
} from '../../api/endUserRecordsApi'
import type { EndUserRecord, EndUserRecordStats } from '../../api/portalApi'
import { ApiError } from '../../types/auth'
import Pagination from '../common/Pagination'

const PAGE_SIZE = 20

type RatingFilter = 'all' | '5' | 'complications'

const RATING_OPTIONS: { value: RatingFilter; label: string }[] = [
  { value: 'all', label: 'All Records' },
  { value: '5', label: '5-Star Reviews' },
  { value: 'complications', label: 'Regulatory Flags / Complications' },
]

function StarRow({ n, size = 12 }: { n: number; size?: number }) {
  return (
    <div className="flex gap-0.5 items-center">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          className={s <= n ? 'text-amber-500 fill-amber-500' : 'text-gray-300 dark:text-[#3A3F52]'}
        />
      ))}
    </div>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ViewDetailModal({
  record,
  onClose,
}: {
  record: EndUserRecord
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[16px] shadow-2xl w-full max-w-2xl border border-gray-100 dark:border-[#252836] max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#252836]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[10px] bg-[#147BA6]/10 text-[#147BA6] flex items-center justify-center font-mono font-bold text-xs">
              EUR
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold font-mono text-gray-900 dark:text-[#E8EAF0]">{record.recordId}</h3>
                {record.complication && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    <AlertTriangle size={11} /> Adverse Event / Flag
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-[#8892A4] mt-0.5">
                Logged on {formatDate(record.createdAt)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-[#E8EAF0] hover:bg-gray-100 dark:hover:bg-[#252836] transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Regulatory banner if complication */}
          {record.complication && (
            <div className="p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-[10px] flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                  Regulatory Compliance Alert Flagged
                </p>
                <p className="text-xs text-red-700/80 dark:text-red-400/80 mt-0.5">
                  Surgeon or distributor reported a post-operative complication. Verify post-market clinical follow-up records.
                </p>
              </div>
            </div>
          )}

          {/* Section: Clinical & Hospital */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 dark:text-[#5A6075] uppercase tracking-wider mb-2.5">
              Clinical &amp; Hospital Information
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-[10px] bg-gray-50 dark:bg-[#161921] border border-gray-100 dark:border-[#252836]">
                <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">Surgeon / Doctor</p>
                <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0] mt-0.5 flex items-center gap-1.5">
                  <User size={13} className="text-[#147BA6]" /> {record.doctorName}
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-gray-50 dark:bg-[#161921] border border-gray-100 dark:border-[#252836]">
                <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">Hospital / Clinic</p>
                <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0] mt-0.5 flex items-center gap-1.5">
                  <Building2 size={13} className="text-[#1F8A70]" /> {record.hospitalName}
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-gray-50 dark:bg-[#161921] border border-gray-100 dark:border-[#252836]">
                <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">City / Location</p>
                <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0] mt-0.5 flex items-center gap-1.5">
                  <MapPin size={13} className="text-amber-500" /> {record.location}
                </p>
              </div>
            </div>
          </div>

          {/* Section: Implant Specifications */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 dark:text-[#5A6075] uppercase tracking-wider mb-2.5">
              Implant Device Details
            </h4>
            <div className="p-4 rounded-[12px] bg-gray-50 dark:bg-[#161921] border border-gray-100 dark:border-[#252836] space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs font-mono font-bold text-[#147BA6]">{record.itemCode}</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] mt-0.5">
                    {record.itemName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">Quantity Used</p>
                  <p className="text-base font-bold text-gray-900 dark:text-[#E8EAF0]">{record.quantity} unit{record.quantity === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200/60 dark:border-[#252836]">
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">Batch / Lot ID</p>
                  <p className="text-xs font-mono font-medium text-gray-800 dark:text-[#C4C9D8] mt-0.5">
                    {record.batchId}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">Implantation Date</p>
                  <p className="text-xs font-medium text-gray-800 dark:text-[#C4C9D8] mt-0.5 flex items-center gap-1.5">
                    <Calendar size={13} className="text-gray-400" /> {formatDate(record.implantationDate)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Distributor Attribution */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 dark:text-[#5A6075] uppercase tracking-wider mb-2.5">
              Distributor Attribution
            </h4>
            <div className="p-3.5 rounded-[10px] bg-gray-50 dark:bg-[#161921] border border-gray-100 dark:border-[#252836] flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">
                  {record.customerName ?? record.customerId ?? '—'}
                </p>
                <p className="text-[10px] font-mono text-gray-400 dark:text-[#5A6075] mt-0.5">
                  Customer ID: {record.customerId ?? '—'}
                </p>
              </div>
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] text-[#147BA6]">
                Verified Partner
              </span>
            </div>
          </div>

          {/* Section: Post-Op Feedback & Surgeon Evaluation */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 dark:text-[#5A6075] uppercase tracking-wider mb-2.5">
              Surgeon Evaluation &amp; Post-Op Feedback
            </h4>
            <div className="p-4 rounded-[12px] bg-gray-50 dark:bg-[#161921] border border-gray-100 dark:border-[#252836] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700 dark:text-[#C4C9D8]">Satisfaction:</span>
                  {record.satisfactionRating != null ? (
                    <div className="flex items-center gap-2">
                      <StarRow n={record.satisfactionRating} size={14} />
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                        {record.satisfactionRating} / 5
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Not rated</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700 dark:text-[#C4C9D8]">Complication:</span>
                  {record.complication ? (
                    <span className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertTriangle size={13} /> Yes (Flagged)
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 size={13} /> None Reported
                    </span>
                  )}
                </div>
              </div>

              {record.feedbackNotes ? (
                <div className="p-3 bg-white dark:bg-[#1A1D2E] rounded-[8px] border border-gray-100 dark:border-[#252836]">
                  <p className="text-[10px] text-gray-400 dark:text-[#5A6075] mb-1 font-semibold">Notes from Surgeon:</p>
                  <p className="text-xs text-gray-700 dark:text-[#C4C9D8] whitespace-pre-wrap leading-relaxed">
                    "{record.feedbackNotes}"
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-[#5A6075] italic">No post-op comments provided.</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-gray-100 dark:border-[#252836] bg-gray-50/50 dark:bg-[#161921]">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold rounded-[8px] bg-[#147BA6] text-white hover:brightness-95 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminEndUsers() {
  const [records, setRecords] = useState<EndUserRecord[]>([])
  const [stats, setStats] = useState<EndUserRecordStats & { totalDistributors?: number }>({
    totalRecords: 0,
    topHospital: null,
    topHospitalCount: 0,
    avgSatisfaction: null,
    complicationAlerts: 0,
    totalDistributors: 0,
  })
  const [distributors, setDistributors] = useState<EndUserDistributorOption[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [distributorFilter, setDistributorFilter] = useState('all')
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all')
  const [page, setPage] = useState(1)

  const [viewRecord, setViewRecord] = useState<EndUserRecord | null>(null)

  // Debounce search input by 250ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, 250)
    return () => clearTimeout(t)
  }, [searchInput])

  // Single data fetching effect triggered on filter / debounced search changes
  useEffect(() => {
    let cancelled = false
    if (!initialLoading) {
      setRefreshing(true)
    }
    setError(null)
    fetchAdminEndUserRecords({
      search: debouncedSearch,
      customerId: distributorFilter,
      rating: ratingFilter,
    })
      .then((res) => {
        if (cancelled) return
        setRecords(res.items)
        setStats(res.stats)
        if (res.distributors && res.distributors.length > 0) {
          setDistributors(res.distributors)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load implant records.')
      })
      .finally(() => {
        if (!cancelled) {
          setInitialLoading(false)
          setRefreshing(false)
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, distributorFilter, ratingFilter])

  function handleManualRefresh() {
    setRefreshing(true)
    fetchAdminEndUserRecords({
      search: debouncedSearch,
      customerId: distributorFilter,
      rating: ratingFilter,
    })
      .then((res) => {
        setRecords(res.items)
        setStats(res.stats)
        if (res.distributors && res.distributors.length > 0) {
          setDistributors(res.distributors)
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not load implant records.')
      })
      .finally(() => setRefreshing(false))
  }

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, distributorFilter, ratingFilter])

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE))
  const pageRows = useMemo(() => {
    return records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  }, [records, page])

  function exportCsv() {
    if (records.length === 0) return
    const headers = [
      'Record ID',
      'Distributor',
      'Customer ID',
      'Surgeon Name',
      'Hospital Name',
      'City / Location',
      'Implant SKU',
      'Implant Name',
      'Batch ID',
      'Quantity',
      'Implantation Date',
      'Satisfaction Rating',
      'Complication Reported',
      'Surgeon Feedback',
      'Logged At',
    ]

    const rows = records.map((r) => [
      r.recordId,
      r.customerName ?? '',
      r.customerId ?? '',
      r.doctorName,
      r.hospitalName,
      r.location,
      r.itemCode,
      `"${r.itemName.replace(/"/g, '""')}"`,
      r.batchId,
      r.quantity,
      r.implantationDate,
      r.satisfactionRating ?? '',
      r.complication ? 'YES' : 'NO',
      `"${(r.feedbackNotes ?? '').replace(/"/g, '""')}"`,
      r.createdAt,
    ])

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `uteshiya_implant_traceability_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const kpis = [
    {
      label: 'Total Implants Logged',
      value: String(stats.totalRecords),
      sub: stats.totalDistributors ? `Across ${stats.totalDistributors} distributor partner(s)` : 'All time usage',
      color: '#147BA6',
      icon: ClipboardList,
    },
    {
      label: 'Complication Alerts',
      value: String(stats.complicationAlerts),
      sub: stats.complicationAlerts > 0 ? 'Requires clinical review' : 'No adverse flags reported',
      color: stats.complicationAlerts > 0 ? '#DC2626' : '#16A34A',
      icon: AlertTriangle,
      alert: stats.complicationAlerts > 0,
    },
    {
      label: 'Surgeon Satisfaction',
      value: stats.avgSatisfaction != null ? `${stats.avgSatisfaction} / 5` : '—',
      sub: 'Average clinical score',
      color: '#F59E0B',
      icon: Star,
    },
    {
      label: 'Top Implantation Center',
      value: stats.topHospital ?? '—',
      sub: stats.topHospitalCount ? `${stats.topHospitalCount} implants recorded` : 'No hospital data yet',
      color: '#1F8A70',
      icon: Building2,
    },
  ]

  return (
    <div className="p-5 lg:p-7 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-[#E8EAF0]">End-User &amp; Implant Traceability</h2>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
            Monitor doctor usage, hospital implantation data, and regulatory post-op feedback across all distributors
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleManualRefresh}
            title="Refresh records"
            disabled={refreshing || initialLoading}
            className="p-2 border border-gray-200 dark:border-[#252836] bg-white dark:bg-[#1A1D2E] text-gray-600 dark:text-[#C4C9D8] rounded-[10px] hover:bg-gray-50 dark:hover:bg-[#252836] transition disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-[#147BA6]' : ''} />
          </button>
          <button
            onClick={exportCsv}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-gray-200 dark:border-[#252836] bg-white dark:bg-[#1A1D2E] text-gray-700 dark:text-[#C4C9D8] rounded-[10px] hover:bg-gray-50 dark:hover:bg-[#252836] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={14} className="text-[#147BA6]" /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <div
              key={k.label}
              className={`bg-white dark:bg-[#1A1D2E] rounded-[14px] p-5 border transition-all ${
                k.alert
                  ? 'border-red-200 dark:border-red-900/50 shadow-sm shadow-red-500/5'
                  : 'border-gray-100 dark:border-[#252836] shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-[#8892A4]">{k.label}</span>
                <div
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${k.color}15`, color: k.color }}
                >
                  <Icon size={16} />
                </div>
              </div>
              <div className="h-8 flex items-center mt-2.5">
                {initialLoading ? (
                  <div className="h-7 w-20 bg-gray-100 dark:bg-[#252836] rounded animate-pulse" />
                ) : (
                  <p className="text-2xl font-bold" style={{ color: k.color }}>
                    {k.value}
                  </p>
                )}
              </div>
              <p className="text-[11px] text-gray-400 dark:text-[#5A6075] mt-1">{k.sub}</p>
            </div>
          )
        })}
      </div>

      {/* Filter and Search Toolbar */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search Surgeon, Hospital, Record ID, SKU, Batch..."
            className="w-full pl-8 pr-4 py-2 text-xs border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] dark:placeholder-[#5A6075] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>

        {/* Distributor Filter */}
        <select
          value={distributorFilter}
          onChange={(e) => setDistributorFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-700 dark:text-[#C4C9D8] transition min-w-[160px]"
        >
          <option value="all">All Distributors</option>
          {distributors.map((d) => (
            <option key={d.customerId} value={d.customerId}>
              {d.customerName} ({d.customerId})
            </option>
          ))}
        </select>

        {/* Review / Complication Filter */}
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value as RatingFilter)}
          className="px-3 py-2 text-xs border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-700 dark:text-[#C4C9D8] transition"
        >
          {RATING_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                {[
                  'Record ID',
                  'Distributor Partner',
                  'Surgeon & Hospital',
                  'Implant SKU & Batch',
                  'Surgery Date',
                  'Patient / Post-Op Feedback',
                  'Action',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-[#8892A4] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y divide-gray-50 dark:divide-[#252836] transition-opacity duration-200 ${refreshing ? 'opacity-60' : 'opacity-100'}`}>
              {initialLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-xs text-gray-400 dark:text-[#5A6075]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw size={18} className="animate-spin text-[#147BA6]" />
                      <span>Loading implant records…</span>
                    </div>
                  </td>
                </tr>
              )}
              {error && !initialLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-xs text-red-600 dark:text-red-400">
                    {error}
                  </td>
                </tr>
              )}
              {!initialLoading && !error && records.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-xs text-gray-400 dark:text-[#5A6075]">
                    No implant traceability records match your search or filters.
                  </td>
                </tr>
              )}
              {!initialLoading &&
                !error &&
                pageRows.map((r) => (
                  <tr
                    key={r.id}
                    className={`hover:bg-gray-50/70 dark:hover:bg-[#1F2233] transition ${
                      r.complication ? 'bg-red-50/20 dark:bg-[rgba(220,38,38,0.04)]' : ''
                    }`}
                  >
                    {/* Record ID */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-[#147BA6]">{r.recordId}</span>
                        {r.complication && (
                          <span title="Adverse complication flagged">
                            <AlertTriangle size={13} className="text-red-500 animate-pulse" />
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Distributor */}
                    <td className="px-5 py-3.5 min-w-[180px]">
                      <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">
                        {r.customerName ?? r.customerId}
                      </p>
                      <p className="text-[10px] font-mono text-gray-400 dark:text-[#5A6075] mt-0.5">
                        ID: {r.customerId}
                      </p>
                    </td>

                    {/* Surgeon & Hospital */}
                    <td className="px-5 py-3.5 min-w-[200px]">
                      <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">{r.doctorName}</p>
                      <p className="text-[11px] text-gray-500 dark:text-[#8892A4] mt-0.5">
                        {r.hospitalName}, {r.location}
                      </p>
                    </td>

                    {/* Implant SKU & Batch */}
                    <td className="px-5 py-3.5 min-w-[220px]">
                      <p className="text-xs font-mono font-bold text-[#147BA6]">{r.itemCode}</p>
                      <p className="text-[11px] text-gray-600 dark:text-[#96A0B4] mt-0.5 max-w-[240px] truncate">
                        {r.itemName}
                      </p>
                      <p className="text-[10px] font-mono text-gray-400 dark:text-[#5A6075]">
                        Batch: {r.batchId} · Qty: {r.quantity}
                      </p>
                    </td>

                    {/* Date */}
                    <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-[#96A0B4] whitespace-nowrap">
                      {formatDate(r.implantationDate)}
                    </td>

                    {/* Feedback */}
                    <td className="px-5 py-3.5 min-w-[200px]">
                      {r.hasFeedback ? (
                        <>
                          {r.satisfactionRating != null && <StarRow n={r.satisfactionRating} size={11} />}
                          {r.feedbackNotes && (
                            <p
                              className={`text-[11px] mt-1 line-clamp-1 max-w-[240px] ${
                                r.complication
                                  ? 'text-red-600 dark:text-red-400 font-medium'
                                  : 'text-gray-600 dark:text-[#96A0B4]'
                              }`}
                            >
                              "{r.feedbackNotes}"
                            </p>
                          )}
                          {r.complication && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 mt-1">
                              <AlertTriangle size={9} /> Regulatory Flag
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-gray-400 dark:text-[#5A6075]">No feedback yet</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <button
                        onClick={() => setViewRecord(r)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-[6px] text-gray-600 dark:text-[#C4C9D8] hover:text-[#147BA6] hover:bg-[#e8f4fa] dark:hover:bg-[rgba(20,123,166,0.15)] transition"
                        title="View complete record"
                      >
                        <Eye size={13} /> View
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {!initialLoading && !error && records.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 dark:border-[#252836]">
            <span className="text-xs text-gray-500 dark:text-[#8892A4]">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, records.length)} of {records.length} records
            </span>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Modal */}
      {viewRecord && <ViewDetailModal record={viewRecord} onClose={() => setViewRecord(null)} />}
    </div>
  )
}

