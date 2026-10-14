import { AlertTriangle, Eye, MessageSquarePlus, Plus, Search, Star, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  createEndUserRecord,
  fetchEndUserRecords,
  fetchPortalInventory,
  updateEndUserFeedback,
  type EndUserRecord,
  type EndUserRecordStats,
  type PortalInventoryItem,
} from '../../api/portalApi'
import { ApiError } from '../../types/auth'

type RatingFilter = 'all' | '5' | 'complications'

const RATING_LABELS: Record<RatingFilter, string> = {
  all: 'All',
  '5': '5 Stars',
  complications: 'Complications',
}

interface FromInventoryState {
  fromInventory?: { itemCode: string; itemName: string; unit: string | null; maxQuantity: number }
}

function StarRow({ n, size = 11 }: { n: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={size} fill={s <= n ? '#F59E0B' : 'none'} stroke={s <= n ? '#F59E0B' : '#D1D5DB'} />
      ))}
    </div>
  )
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)}>
          <Star size={20} fill={s <= value ? '#F59E0B' : 'none'} stroke={s <= value ? '#F59E0B' : '#D1D5DB'} />
        </button>
      ))}
    </div>
  )
}

function ComplicationToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-red-500' : 'bg-gray-200 dark:bg-[#252836]'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm">
      <p className="text-lg font-bold" style={{ color }}>
        {value}
      </p>
      <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5 leading-tight">{label}</p>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-900 dark:text-[#E8EAF0] dark:placeholder-[#5A6075] transition'

// ── Record New Usage form (also opened by Inventory's "Subtract") ──────
function RecordUsageForm({
  prefillItemCode,
  onClose,
  onSaved,
}: {
  prefillItemCode?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [stock, setStock] = useState<PortalInventoryItem[] | null>(null)
  const [form, setForm] = useState({
    itemCode: prefillItemCode ?? '',
    quantity: '1',
    doctorName: '',
    hospitalName: '',
    location: '',
    batchId: '',
    implantationDate: '',
    feedbackNotes: '',
    satisfactionRating: 0,
    complication: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPortalInventory()
      .then((items) => setStock(items.filter((i) => i.quantity > 0)))
      .catch(() => setStock([]))
  }, [])

  const selected = stock?.find((i) => i.itemCode === form.itemCode) ?? null
  const maxQty = selected?.quantity ?? 0

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const coreValid =
    form.itemCode &&
    Number(form.quantity) > 0 &&
    Number(form.quantity) <= maxQty &&
    form.doctorName.trim() &&
    form.hospitalName.trim() &&
    form.location.trim() &&
    form.batchId.trim() &&
    form.implantationDate

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await createEndUserRecord({
        itemCode: form.itemCode,
        quantity: Number(form.quantity),
        doctorName: form.doctorName.trim(),
        hospitalName: form.hospitalName.trim(),
        location: form.location.trim(),
        batchId: form.batchId.trim(),
        implantationDate: form.implantationDate,
        feedbackNotes: form.feedbackNotes.trim() || null,
        satisfactionRating: form.satisfactionRating || null,
        complication: form.complication,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the record.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[16px] shadow-xl w-full max-w-xl border border-gray-100 dark:border-[#252836] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#252836] sticky top-0 bg-white dark:bg-[#1A1D2E]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Record New Implant Usage</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-[#252836] transition"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-[rgba(220,38,38,0.1)] rounded-[8px] px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-1.5 block">
              Implant SKU (from your inventory)
            </label>
            <select
              value={form.itemCode}
              onChange={(e) => {
                set('itemCode', e.target.value)
                set('quantity', '1')
              }}
              className={`${inputCls} appearance-none`}
            >
              <option value="">
                {stock == null ? 'Loading your stock…' : 'Select an implant you have in stock…'}
              </option>
              {(stock ?? []).map((i) => (
                <option key={i.itemCode} value={i.itemCode}>
                  {i.itemName} — {i.quantity} {i.unit ?? ''} in stock
                </option>
              ))}
            </select>
            {stock != null && stock.length === 0 && (
              <p className="text-[11px] text-gray-400 dark:text-[#5A6075] mt-1">
                You have no items in stock to record usage against.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-1.5 block">Doctor Name</label>
              <input
                value={form.doctorName}
                onChange={(e) => set('doctorName', e.target.value)}
                placeholder="Dr. Full Name"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-1.5 block">
                Hospital / Clinic
              </label>
              <input
                value={form.hospitalName}
                onChange={(e) => set('hospitalName', e.target.value)}
                placeholder="Hospital name"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-1.5 block">
                City / Location
              </label>
              <input
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
                placeholder="City"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-1.5 block">
                Implantation Date
              </label>
              <input
                type="date"
                value={form.implantationDate}
                onChange={(e) => set('implantationDate', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-1.5 block">Batch ID</label>
              <input
                value={form.batchId}
                onChange={(e) => set('batchId', e.target.value)}
                placeholder="BATCH-…"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-1.5 block">
                Quantity Used{selected ? ` (max ${maxQty} ${selected.unit ?? ''})` : ''}
              </label>
              <input
                type="number"
                min={1}
                max={maxQty || undefined}
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-1.5 block">
              Post-op Feedback <span className="text-gray-400 dark:text-[#5A6075]">(optional)</span>
            </label>
            <textarea
              value={form.feedbackNotes}
              onChange={(e) => set('feedbackNotes', e.target.value)}
              rows={2}
              placeholder="Post-operative feedback from surgeon…"
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-2">
                Satisfaction Rating <span className="text-gray-400 dark:text-[#5A6075]">(optional)</span>
              </p>
              <StarPicker value={form.satisfactionRating} onChange={(n) => set('satisfactionRating', n)} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600 dark:text-[#8892A4]">Complication Reported</span>
              <ComplicationToggle value={form.complication} onChange={(v) => set('complication', v)} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-[#252836]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] text-gray-600 dark:text-[#96A0B4] hover:bg-gray-50 dark:hover:bg-[#252836] transition"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!coreValid || saving}
            className="px-4 py-2 text-sm font-semibold text-white rounded-[8px] hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#147BA6' }}
          >
            {saving ? 'Saving…' : 'Save Record'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── View (read-only) ──────────────────────────────────────────────────
function ViewRecordModal({ record, onClose }: { record: EndUserRecord; onClose: () => void }) {
  const rows: [string, string][] = [
    ['Record ID', record.recordId],
    ['Doctor', record.doctorName],
    ['Hospital', record.hospitalName],
    ['Location', record.location],
    ['Implant', `${record.itemName} (${record.itemCode})`],
    ['Batch ID', record.batchId],
    ['Quantity Used', String(record.quantity)],
    ['Implantation Date', record.implantationDate],
    ['Recorded', new Date(record.createdAt).toLocaleString('en-IN')],
  ]
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[16px] shadow-xl w-full max-w-md border border-gray-100 dark:border-[#252836]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#252836]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Record {record.recordId}</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-[#252836] transition"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-2.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 text-xs">
              <span className="text-gray-500 dark:text-[#8892A4]">{k}</span>
              <span className="text-gray-900 dark:text-[#E8EAF0] font-medium text-right">{v}</span>
            </div>
          ))}
          <div className="pt-2 border-t border-gray-100 dark:border-[#252836]">
            <p className="text-xs text-gray-500 dark:text-[#8892A4] mb-1">Post-op Feedback</p>
            {record.hasFeedback ? (
              <>
                {record.satisfactionRating != null && <StarRow n={record.satisfactionRating} size={13} />}
                <p className="text-xs text-gray-700 dark:text-[#C4C9D8] mt-1">{record.feedbackNotes || '—'}</p>
                {record.complication && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 mt-1.5">
                    <AlertTriangle size={9} /> Complication reported
                  </span>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400 dark:text-[#5A6075]">No feedback recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Feedback (PATCH only) ─────────────────────────────────────────
function FeedbackModal({
  record,
  onClose,
  onSaved,
}: {
  record: EndUserRecord
  onClose: () => void
  onSaved: () => void
}) {
  const [notes, setNotes] = useState(record.feedbackNotes ?? '')
  const [rating, setRating] = useState(record.satisfactionRating ?? 0)
  const [complication, setComplication] = useState(record.complication)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await updateEndUserFeedback(record.id, {
        feedbackNotes: notes.trim() || null,
        satisfactionRating: rating || null,
        complication,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save feedback.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[16px] shadow-xl w-full max-w-md border border-gray-100 dark:border-[#252836]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#252836]">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Add Post-op Feedback</h3>
            <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">{record.recordId} · {record.itemName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-[#252836] transition"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-[rgba(220,38,38,0.1)] rounded-[8px] px-3 py-2">{error}</p>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-1.5 block">Feedback Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Post-operative feedback…"
              className={`${inputCls} resize-none`}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-2">Satisfaction Rating</p>
              <StarPicker value={rating} onChange={setRating} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600 dark:text-[#8892A4]">Complication Reported</span>
              <ComplicationToggle value={complication} onChange={setComplication} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-[#252836]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] text-gray-600 dark:text-[#96A0B4] hover:bg-gray-50 dark:hover:bg-[#252836] transition"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white rounded-[8px] hover:brightness-95 transition disabled:opacity-50"
            style={{ background: '#147BA6' }}
          >
            {saving ? 'Saving…' : 'Save Feedback'}
          </button>
        </div>
      </div>
    </div>
  )
}

const EMPTY_STATS: EndUserRecordStats = {
  totalRecords: 0,
  topHospital: null,
  topHospitalCount: 0,
  avgSatisfaction: null,
  complicationAlerts: 0,
}

export default function DistEndUsers() {
  const location = useLocation()
  const navigate = useNavigate()
  const fromInventory = (location.state as FromInventoryState | null)?.fromInventory

  const [records, setRecords] = useState<EndUserRecord[]>([])
  const [stats, setStats] = useState<EndUserRecordStats>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [rating, setRating] = useState<RatingFilter>('all')

  const [showForm, setShowForm] = useState(false)
  const [formPrefill, setFormPrefill] = useState<string | undefined>(undefined)
  const [viewRecord, setViewRecord] = useState<EndUserRecord | null>(null)
  const [feedbackRecord, setFeedbackRecord] = useState<EndUserRecord | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    return fetchEndUserRecords()
      .then((data) => {
        setRecords(data.items)
        setStats(data.stats)
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load records.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
  }, [])

  // Opened from Inventory's "Subtract" — auto-open the form for that item,
  // then clear the nav state so a refresh doesn't reopen it.
  useEffect(() => {
    if (fromInventory) {
      setFormPrefill(fromInventory.itemCode)
      setShowForm(true)
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromInventory])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return records.filter((r) => {
      const matchQ =
        !q ||
        r.doctorName.toLowerCase().includes(q) ||
        r.hospitalName.toLowerCase().includes(q) ||
        r.recordId.toLowerCase().includes(q) ||
        r.batchId.toLowerCase().includes(q)
      const matchR =
        rating === 'all' ||
        (rating === '5' && r.satisfactionRating === 5) ||
        (rating === 'complications' && r.complication)
      return matchQ && matchR
    })
  }, [records, search, rating])

  const kpis = [
    { label: 'Total Records Logged', value: String(stats.totalRecords), color: '#147BA6' },
    { label: 'Top Hospital', value: stats.topHospital ?? '—', color: '#1F8A70' },
    {
      label: 'Avg Satisfaction',
      value: stats.avgSatisfaction != null ? `${stats.avgSatisfaction} / 5` : '—',
      color: '#F59E0B',
    },
    { label: 'Complication Alerts', value: String(stats.complicationAlerts), color: '#DC2626' },
  ]

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">End-User &amp; Implant Traceability</h2>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
            Record doctor usage, hospital implantation data, and post-op feedback
          </p>
        </div>
        <button
          onClick={() => {
            setFormPrefill(undefined)
            setShowForm(true)
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-[10px] hover:brightness-95 transition"
          style={{ background: '#147BA6' }}
        >
          <Plus size={14} /> Record New Usage
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Doctor / Hospital / Record ID / Batch ID…"
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] dark:placeholder-[#5A6075] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>
        <select
          value={rating}
          onChange={(e) => setRating(e.target.value as RatingFilter)}
          className="appearance-none px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-700 dark:text-[#C4C9D8] transition"
        >
          {(Object.keys(RATING_LABELS) as RatingFilter[]).map((r) => (
            <option key={r} value={r}>
              {RATING_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                {['Record ID', 'Doctor & Hospital', 'Implant SKU & Batch', 'Date', 'Patient Feedback', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#5A6075] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-[#252836]">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-gray-400 dark:text-[#5A6075]">
                    Loading records…
                  </td>
                </tr>
              )}
              {error && !loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={`hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition ${r.complication ? 'bg-amber-50/30 dark:bg-[rgba(245,158,11,0.04)]' : ''}`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-semibold text-[#147BA6]">{r.recordId}</span>
                        {r.complication && <AlertTriangle size={11} className="text-amber-500" />}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 min-w-[200px]">
                      <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">{r.doctorName}</p>
                      <p className="text-[10px] text-gray-400 dark:text-[#5A6075] mt-0.5">
                        {r.hospitalName}, {r.location}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs font-mono text-[#147BA6]">{r.itemCode}</p>
                      <p className="text-[10px] text-gray-500 dark:text-[#8892A4] mt-0.5 max-w-[220px]">{r.itemName}</p>
                      <p className="text-[10px] font-mono text-gray-400 dark:text-[#5A6075]">
                        Batch: {r.batchId} · Qty: {r.quantity}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-[#96A0B4] whitespace-nowrap">
                      {r.implantationDate}
                    </td>
                    <td className="px-5 py-3.5 min-w-[200px]">
                      {r.hasFeedback ? (
                        <>
                          {r.satisfactionRating != null && <StarRow n={r.satisfactionRating} />}
                          {r.feedbackNotes && (
                            <p
                              className={`text-[11px] mt-1 leading-snug max-w-[260px] ${r.complication ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-[#96A0B4]'}`}
                            >
                              {r.feedbackNotes}
                            </p>
                          )}
                          {r.complication && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 mt-1">
                              <AlertTriangle size={9} /> Regulatory Flag
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-gray-400 dark:text-[#5A6075]">No feedback yet</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setViewRecord(r)}
                          className="w-7 h-7 flex items-center justify-center rounded-[6px] text-gray-400 hover:text-[#147BA6] hover:bg-[#e8f4fa] dark:hover:bg-[rgba(20,123,166,0.15)] transition"
                          title="View record"
                        >
                          <Eye size={13} />
                        </button>
                        {!r.hasFeedback && (
                          <button
                            onClick={() => setFeedbackRecord(r)}
                            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-gray-400 hover:text-[#1F8A70] hover:bg-green-50 dark:hover:bg-[rgba(31,138,112,0.15)] transition"
                            title="Add feedback"
                          >
                            <MessageSquarePlus size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-gray-400 dark:text-[#5A6075]">
                    {records.length === 0
                      ? 'No usage recorded yet. Use "Record New Usage" when an implant is used.'
                      : 'No records match your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <RecordUsageForm
          prefillItemCode={formPrefill}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            void load()
          }}
        />
      )}
      {viewRecord && <ViewRecordModal record={viewRecord} onClose={() => setViewRecord(null)} />}
      {feedbackRecord && (
        <FeedbackModal
          record={feedbackRecord}
          onClose={() => setFeedbackRecord(null)}
          onSaved={() => {
            setFeedbackRecord(null)
            void load()
          }}
        />
      )}
    </div>
  )
}
