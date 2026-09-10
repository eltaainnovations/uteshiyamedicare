import { useEffect, useRef, useState } from 'react'
import {
  Calendar,
  CheckCircle,
  Clock,
  Edit2,
  Package,
  Percent,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import {
  createOffer,
  deleteOffer,
  listOffers,
  updateOffer,
  type Offer,
  type OfferProduct,
} from '../../api/offersApi'
import { fetchProducts } from '../../api/productsApi'
import { ApiError } from '../../types/auth'

type Filter = 'All' | 'Active' | 'Scheduled' | 'Expired'

interface FormState {
  title: string
  description: string
  appliesToAll: boolean
  products: OfferProduct[]
  discountPercent: number
  startDate: string
  endDate: string
}

const emptyForm: FormState = {
  title: '',
  description: '',
  appliesToAll: false,
  products: [],
  discountPercent: 0,
  startDate: '',
  endDate: '',
}

const statusStyle: Record<string, string> = {
  Active: 'bg-green-100 text-green-700',
  Scheduled: 'bg-blue-100 text-blue-700',
  Expired: 'bg-gray-100 text-gray-500',
}

const statusIcon: Record<string, React.ElementType> = {
  Active: CheckCircle,
  Scheduled: Clock,
  Expired: X,
}

// ── Debounced product search + removable chips ─────────────────────────
// Same pattern as DistributorTypeahead: 300ms debounce, cancel-on-unmount,
// close on outside click. Backed by GET /products?search=<query>.
function ProductPicker({
  selected,
  onChange,
}: {
  selected: OfferProduct[]
  onChange: (next: OfferProduct[]) => void
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<OfferProduct[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      return
    }
    let cancelled = false
    setLoading(true)
    const t = window.setTimeout(() => {
      fetchProducts({ search: query.trim(), pageSize: 20 })
        .then((data) => {
          if (!cancelled) {
            setSuggestions(data.items.slice(0, 8).map((p) => ({ itemCode: p.itemCode, itemName: p.itemName })))
          }
        })
        .catch(() => {
          if (!cancelled) setSuggestions([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const add = (p: OfferProduct) => {
    if (!selected.some((s) => s.itemCode === p.itemCode)) onChange([...selected, p])
    setQuery('')
    setOpen(false)
  }
  const remove = (itemCode: string) => onChange(selected.filter((s) => s.itemCode !== itemCode))

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((p) => (
            <span
              key={p.itemCode}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] text-[#147BA6]"
            >
              {p.itemName}
              <button
                type="button"
                onClick={() => remove(p.itemCode)}
                className="hover:text-red-500 transition"
                aria-label={`Remove ${p.itemName}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div ref={containerRef} className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search products by name or code…"
          className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-900 dark:text-[#E8EAF0] dark:placeholder-[#5A6075] transition"
        />
        {open && query.trim() && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-[#1A1D2E] border border-gray-100 dark:border-[#252836] rounded-[8px] shadow-lg">
            {loading && <div className="px-3 py-2 text-xs text-gray-400 dark:text-[#5A6075]">Searching…</div>}
            {!loading && suggestions.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400 dark:text-[#5A6075]">No products found.</div>
            )}
            {!loading &&
              suggestions.map((p) => {
                const already = selected.some((s) => s.itemCode === p.itemCode)
                return (
                  <button
                    key={p.itemCode}
                    type="button"
                    disabled={already}
                    onClick={() => add(p)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-[#1F2233] transition disabled:opacity-40"
                  >
                    <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">{p.itemName}</p>
                    <p className="text-[10px] font-mono text-gray-400 dark:text-[#5A6075]">{p.itemCode}</p>
                  </button>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function OffersManagement() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Offer | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [filter, setFilter] = useState<Filter>('All')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listOffers()
      .then((data) => {
        if (!cancelled) setOffers(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load offers.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }

  useEffect(load, [])

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setShowModal(true)
  }

  const openEdit = (o: Offer) => {
    setEditing(o)
    setForm({
      title: o.title,
      description: o.description,
      appliesToAll: o.appliesToAll,
      products: o.products,
      discountPercent: o.discountPercent,
      startDate: o.startDate,
      endDate: o.endDate,
    })
    setFormError(null)
    setShowModal(true)
  }

  const save = async () => {
    if (!form.title.trim()) {
      setFormError('Offer title is required.')
      return
    }
    if (!form.startDate || !form.endDate) {
      setFormError('Start and end dates are required.')
      return
    }
    if (form.endDate < form.startDate) {
      setFormError('End date must be on or after the start date.')
      return
    }
    if (!form.appliesToAll && form.products.length === 0) {
      setFormError('Add at least one product, or turn on "Applies to all products".')
      return
    }

    const payload = {
      title: form.title.trim(),
      description: form.description,
      discountPercent: form.discountPercent,
      startDate: form.startDate,
      endDate: form.endDate,
      appliesToAll: form.appliesToAll,
      productItemCodes: form.appliesToAll ? [] : form.products.map((p) => p.itemCode),
    }

    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        await updateOffer(editing.id, payload)
      } else {
        await createOffer(payload)
      }
      setShowModal(false)
      load()
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the offer.')
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (deleteId === null) return
    setDeleting(true)
    try {
      await deleteOffer(deleteId)
      setDeleteId(null)
      load()
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the offer.')
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  const filtered = filter === 'All' ? offers : offers.filter((o) => o.status === filter)
  const counts = {
    Active: offers.filter((o) => o.status === 'Active').length,
    Scheduled: offers.filter((o) => o.status === 'Scheduled').length,
    Expired: offers.filter((o) => o.status === 'Expired').length,
  }

  const productsLabel = (o: Offer) =>
    o.appliesToAll
      ? 'All products'
      : o.products.length === 0
        ? '—'
        : o.products.map((p) => p.itemName).join(', ')

  return (
    <div className="p-5 lg:p-7 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Offers Management</h2>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
            Create and manage promotional offers visible on the distributor portal
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-[10px] hover:brightness-95 transition"
          style={{ background: '#147BA6' }}
        >
          <Plus size={15} />
          New Offer
        </button>
      </div>

      {/* Stats chips */}
      <div className="flex gap-2 flex-wrap">
        {(['All', 'Active', 'Scheduled', 'Expired'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
              filter === s
                ? 'bg-[#147BA6] text-white border-[#147BA6]'
                : 'bg-white dark:bg-[#1A1D2E] text-gray-600 dark:text-[#8892A4] border-gray-200 dark:border-[#252836] hover:border-gray-300 dark:hover:border-[#353848]'
            }`}
          >
            {s}
            {s !== 'All' && <span className="ml-1.5 text-[10px] font-bold">{counts[s]}</span>}
            {s === 'All' && <span className="ml-1.5 text-[10px] font-bold">{offers.length}</span>}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-red-200 dark:border-red-900/40 shadow-sm p-8 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                {['Offer', 'Products', 'Discount', 'Period', 'Status', 'Actions'].map((h) => (
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
              {filtered.map((o) => {
                const SIcon = statusIcon[o.status]
                return (
                  <tr key={o.id} className="hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition">
                    <td className="px-5 py-4 min-w-[220px]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-[8px] bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] flex items-center justify-center flex-shrink-0">
                          <Tag size={14} className="text-[#147BA6]" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">{o.title}</p>
                          <p className="text-[10px] text-gray-400 dark:text-[#5A6075] mt-0.5 max-w-[200px] truncate">
                            {o.description}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-600 dark:text-[#96A0B4] max-w-[220px] truncate">
                      {productsLabel(o)}
                    </td>
                    <td className="px-5 py-4">
                      {o.discountPercent > 0 ? (
                        <span className="text-sm font-bold text-[#147BA6]">{o.discountPercent}%</span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-[#5A6075]">Free Shipping</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-600 dark:text-[#96A0B4] whitespace-nowrap">
                      {o.startDate} – {o.endDate}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`flex items-center gap-1 w-fit text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyle[o.status]}`}
                      >
                        <SIcon size={10} />
                        {o.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(o)}
                          className="w-7 h-7 flex items-center justify-center rounded-[6px] text-gray-400 hover:text-[#147BA6] hover:bg-[#e8f4fa] dark:hover:bg-[rgba(20,123,166,0.15)] transition"
                          title="Edit"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteId(o.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-[6px] text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-[rgba(220,38,38,0.1)] transition"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-[#5A6075]">
                    {offers.length === 0 ? 'No offers yet. Create your first one.' : 'No offers found for this filter.'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-[#5A6075]">
                    Loading offers…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[16px] shadow-xl w-full max-w-lg border border-gray-100 dark:border-[#252836] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#252836] sticky top-0 bg-white dark:bg-[#1A1D2E]">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">
                {editing ? 'Edit Offer' : 'New Offer'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-[#252836] transition"
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="text-xs text-red-600 bg-red-50 dark:bg-[rgba(220,38,38,0.1)] rounded-[8px] px-3 py-2">
                  {formError}
                </div>
              )}

              {/* Offer Title */}
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] flex items-center gap-1.5 mb-1.5">
                  <Tag size={12} /> Offer Title
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Monsoon Ortho Fest"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-900 dark:text-[#E8EAF0] dark:placeholder-[#5A6075] transition"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] mb-1.5 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Short description shown on the distributor banner..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-900 dark:text-[#E8EAF0] dark:placeholder-[#5A6075] transition resize-none"
                />
              </div>

              {/* Applicable Products */}
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] flex items-center gap-1.5 mb-1.5">
                  <Package size={12} /> Applicable Products
                </label>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.appliesToAll}
                    onChange={(e) => setForm((f) => ({ ...f, appliesToAll: e.target.checked }))}
                    className="accent-[#147BA6]"
                  />
                  <span className="text-xs text-gray-700 dark:text-[#C4C9D8]">Applies to all products</span>
                </label>
                {!form.appliesToAll && (
                  <ProductPicker
                    selected={form.products}
                    onChange={(next) => setForm((f) => ({ ...f, products: next }))}
                  />
                )}
              </div>

              {/* Discount */}
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] flex items-center gap-1.5 mb-1.5">
                  <Percent size={12} /> Discount %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.discountPercent}
                  onChange={(e) => setForm((f) => ({ ...f, discountPercent: +e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-900 dark:text-[#E8EAF0] transition"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] flex items-center gap-1.5 mb-1.5">
                    <Calendar size={12} /> Start Date
                  </label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-900 dark:text-[#E8EAF0] transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-[#8892A4] flex items-center gap-1.5 mb-1.5">
                    <Calendar size={12} /> End Date
                  </label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-900 dark:text-[#E8EAF0] transition"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-[#252836] sticky bottom-0 bg-white dark:bg-[#1A1D2E]">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] text-gray-600 dark:text-[#96A0B4] hover:bg-gray-50 dark:hover:bg-[#252836] transition"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!form.title.trim() || saving}
                className="px-4 py-2 text-sm font-semibold text-white rounded-[8px] hover:brightness-95 disabled:opacity-50 transition"
                style={{ background: '#147BA6' }}
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Offer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] shadow-xl p-6 w-full max-w-sm border border-gray-100 dark:border-[#252836] text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-[rgba(220,38,38,0.15)] flex items-center justify-center mx-auto mb-3">
              <Trash2 size={20} className="text-red-500" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Delete Offer?</h3>
            <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-1.5">
              This will remove the offer from the distributor portal immediately.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] text-gray-600 dark:text-[#96A0B4] hover:bg-gray-50 dark:hover:bg-[#252836] transition"
              >
                Cancel
              </button>
              <button
                onClick={doDelete}
                disabled={deleting}
                className="flex-1 py-2 text-sm font-semibold text-white rounded-[8px] bg-red-500 hover:bg-red-600 disabled:opacity-50 transition"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
