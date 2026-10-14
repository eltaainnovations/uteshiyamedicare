import { Check, Info, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSalesOrder, fetchDistributorProfile, fetchPortalProducts, type PortalProduct, type PortalWelcome } from '../../api/portalApi'
import { ProductCard } from '../distributor/DistProductCatalogue'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useCart } from '../../context/CartContext'
import { ApiError } from '../../types/auth'
import { formatInr } from '../../utils/currency'
import ErrorBlock from '../common/ErrorBlock'
import PageSizeSelect from '../common/PageSizeSelect'
import Pagination from '../common/Pagination'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function StepIndicator({ step }: { step: number }) {
  const steps = ['Confirm Distributor', 'Add Products', 'Review & Send']
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((label, i) => {
        const idx = i + 1
        const isComplete = step > idx
        const isActive = step === idx
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
                  ${isComplete ? 'bg-[#1F8A70] border-[#1F8A70] text-white' : isActive ? 'bg-[#147BA6] border-[#147BA6] text-white' : 'bg-transparent border-gray-300 dark:border-[#252836] text-gray-400 dark:text-[#5A6075]'}`}
              >
                {isComplete ? <Check size={16} /> : idx}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${isActive ? 'text-[#147BA6]' : 'text-gray-400 dark:text-[#5A6075]'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-16 md:w-24 h-0.5 mb-4 mx-1 ${step > idx ? 'bg-[#1F8A70]' : 'bg-gray-200 dark:bg-[#252836]'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// Step 1 — a Sales Person has exactly one linked distributor today (the
// single-distributor simplification — see backend DistributorScope). This
// renders that one distributor as a plain confirmation card rather than a
// search. Once a Sales Person can be linked to several distributors, this
// component is where a real search/picker replaces the fetched-profile
// card below — the rest of the wizard (products, cart, review) doesn't
// need to change.
function ConfirmDistributorStep({ onContinue }: { onContinue: () => void }) {
  const profile = useAsyncData<PortalWelcome>(() => fetchDistributorProfile(), [], 'sales-create-order:distributor')
  const name = profile.data?.company ?? profile.data?.name ?? null

  return (
    <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-6 space-y-5">
      <div className="flex gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-[8px] p-4">
        <Info size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          You're creating an order on behalf of your linked distributor. It will be sent to them for approval
          before it becomes a confirmed order.
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 dark:text-[#E8EAF0] mb-2">Distributor</p>
        {profile.loading ? (
          <div className="animate-pulse h-16 bg-gray-100 dark:bg-[#161921] rounded-[8px]" />
        ) : profile.error ? (
          <ErrorBlock message={profile.error} height={80} />
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-[8px] border border-[#147BA6] bg-[#147BA6]/5 dark:bg-[#147BA6]/10">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #147BA6, #1F8A70)' }}
            >
              {initials(name ?? '?')}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">{name ?? 'Linked distributor'}</p>
              {profile.data?.customerId && (
                <p className="text-xs text-gray-500 dark:text-[#8892A4] font-mono">{profile.data.customerId}</p>
              )}
            </div>
            <Check size={16} className="text-[#147BA6] ml-auto" />
          </div>
        )}
      </div>

      <button
        disabled={!profile.data}
        onClick={onContinue}
        className="px-6 py-2.5 rounded-[8px] text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        style={{ background: profile.data ? 'linear-gradient(135deg, #147BA6, #1F8A70)' : '#9ca3af' }}
      >
        Continue →
      </button>
    </div>
  )
}

// Step 2 — real catalogue (same /portal/products + variant-price
// resolution DistProductCatalogue uses) with an inline running-summary
// panel over the shared cart, instead of the slide-out CartDrawer (which
// isn't mounted for this role).
function AddProductsStep({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const { items, subtotal, setQty, remove } = useCart()

  const [cat, setCat] = useState('All')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [products, setProducts] = useState<PortalProduct[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [search, cat, pageSize])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPortalProducts({ search: search || undefined, category: cat === 'All' ? undefined : cat, page, pageSize })
      .then((data) => {
        if (cancelled) return
        setProducts(data.items)
        setTotal(data.total)
        setCategories(data.categories)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load products.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [search, cat, page, pageSize])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      <div className="flex-1 space-y-4 min-w-0">
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or SKU..."
              className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] dark:placeholder-[#5A6075] rounded-[8px] outline-none focus:border-[#147BA6] transition"
            />
          </div>
          <PageSizeSelect value={pageSize} onChange={setPageSize} label="Products per page" />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {['All', ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition ${
                cat === c
                  ? 'bg-[#147BA6] text-white'
                  : 'bg-white dark:bg-[#1A1D2E] text-gray-600 dark:text-[#8892A4] border border-gray-200 dark:border-[#252836] hover:border-gray-300 dark:hover:border-[#353848]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {error && <ErrorBlock message={error} height={160} />}

        {!error && loading && (
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
            Loading products…
          </div>
        )}

        {!error && !loading && products.length === 0 && (
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
            No products found.
          </div>
        )}

        {!error && !loading && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {products.map((p) => (
              <ProductCard key={p.itemCode} product={p} />
            ))}
          </div>
        )}

        {!error && !loading && total > 0 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onBack}
            className="px-5 py-2.5 rounded-[8px] text-sm font-semibold text-gray-700 dark:text-[#E8EAF0] bg-white dark:bg-[#1A1D2E] border border-gray-200 dark:border-[#252836]"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Order Summary */}
      <div className="lg:w-72 flex-shrink-0">
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-4 lg:sticky lg:top-6">
          <p className="text-sm font-bold text-gray-900 dark:text-[#E8EAF0] mb-3">Order Summary</p>
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-[#5A6075] py-4 text-center">No items added yet</p>
          ) : (
            <div className="space-y-2 mb-4">
              {items.map((line) => (
                <div key={line.itemCode} className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-[#E8EAF0] truncate">{line.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <button
                        onClick={() => setQty(line.itemCode, line.qty - 1)}
                        className="text-gray-400 dark:text-[#5A6075] hover:text-gray-600 dark:hover:text-[#8892A4] text-xs font-bold px-1"
                      >
                        −
                      </button>
                      <span className="text-[10px] text-gray-400 dark:text-[#5A6075]">× {line.qty}</span>
                      <button
                        onClick={() => setQty(line.itemCode, line.qty + 1)}
                        className="text-gray-400 dark:text-[#5A6075] hover:text-gray-600 dark:hover:text-[#8892A4] text-xs font-bold px-1"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">
                      {formatInr(line.price * line.qty)}
                    </span>
                    <button onClick={() => remove(line.itemCode)} className="text-red-400 hover:text-red-500 text-xs">
                      ×
                    </button>
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-100 dark:border-[#252836] pt-2 mt-2">
                <div className="flex justify-between text-xs text-gray-500 dark:text-[#8892A4]">
                  <span>Subtotal</span>
                  <span>{formatInr(subtotal)}</span>
                </div>
              </div>
            </div>
          )}
          <button
            disabled={items.length === 0}
            onClick={onContinue}
            className="w-full py-2.5 rounded-[8px] text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #147BA6, #1F8A70)' }}
          >
            Review Order →
          </button>
        </div>
      </div>
    </div>
  )
}

function ReviewStep({
  distributorName,
  onBack,
}: {
  distributorName: string | null
  onBack: () => void
}) {
  const navigate = useNavigate()
  const { items, subtotal, clear } = useCart()
  const [transactionDate, setTransactionDate] = useState(todayIso())
  const [deliveryDate, setDeliveryDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{ name: string; status: string } | null>(null)

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createSalesOrder({
        transactionDate,
        deliveryDate,
        items: items.map((i) => ({ itemCode: i.itemCode, qty: i.qty })),
      })
      setSubmitted(result)
      clear()
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create the order.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-6 space-y-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#e6f5f1] dark:bg-[rgba(31,138,112,0.15)] flex items-center justify-center mx-auto">
          <Check size={26} className="text-[#1F8A70]" />
        </div>
        <h2 className="text-base font-bold text-gray-900 dark:text-[#E8EAF0]">Order sent for approval</h2>
        <p className="text-sm text-gray-500 dark:text-[#8892A4]">
          <span className="font-mono font-semibold text-gray-900 dark:text-[#E8EAF0]">{submitted.name}</span> ·{' '}
          {submitted.status}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={() => navigate('/sales/pending-approvals')}
            className="px-5 py-2.5 rounded-[8px] text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #147BA6, #1F8A70)' }}
          >
            View Pending Approvals
          </button>
          <button
            onClick={() => navigate('/sales/dashboard')}
            className="px-5 py-2.5 rounded-[8px] text-sm font-semibold text-gray-700 dark:text-[#E8EAF0] bg-white dark:bg-[#1A1D2E] border border-gray-200 dark:border-[#252836]"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-6 space-y-5">
      <h2 className="text-base font-bold text-gray-900 dark:text-[#E8EAF0]">Review Order</h2>

      {distributorName && (
        <div className="bg-gray-50 dark:bg-[#161921] rounded-[8px] p-4">
          <p className="text-xs text-gray-400 dark:text-[#5A6075] font-medium uppercase tracking-wide mb-1">Distributor</p>
          <p className="font-semibold text-gray-900 dark:text-[#E8EAF0]">{distributorName}</p>
        </div>
      )}

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-[#E8EAF0] mb-2">Transaction Date</label>
          <input
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#161921] text-gray-900 dark:text-[#E8EAF0]"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-[#E8EAF0] mb-2">Expected Delivery Date</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#161921] text-gray-900 dark:text-[#E8EAF0]"
          />
        </div>
      </div>

      {/* Items Table */}
      <div className="overflow-x-auto rounded-[8px] border border-gray-100 dark:border-[#252836]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
              {['Item', 'Item Code', 'Qty', 'Unit Price', 'Total'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-[#8892A4] uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.itemCode} className="border-b border-gray-50 dark:border-[#252836] last:border-0">
                <td className="px-4 py-3 text-gray-900 dark:text-[#E8EAF0] font-medium">{item.name}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-[#8892A4] font-mono text-xs">{item.itemCode}</td>
                <td className="px-4 py-3 text-gray-900 dark:text-[#E8EAF0]">{item.qty}</td>
                <td className="px-4 py-3 text-gray-900 dark:text-[#E8EAF0]">{formatInr(item.price)}</td>
                <td className="px-4 py-3 font-semibold text-gray-900 dark:text-[#E8EAF0]">{formatInr(item.price * item.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="bg-gray-50 dark:bg-[#161921] rounded-[8px] p-4 space-y-1">
        <div className="flex justify-between text-base font-bold text-gray-900 dark:text-[#E8EAF0]">
          <span>Subtotal</span>
          <span>{formatInr(subtotal)}</span>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-[#5A6075]">Final tax will be calculated by the system.</p>
      </div>

      {/* Info Banner */}
      <div className="flex gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-[8px] p-4">
        <Info size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          This order will be sent to {distributorName ?? 'your distributor'} for approval and will appear in their
          Pending Approvals.
        </p>
      </div>

      {submitError && <ErrorBlock message={submitError} height={60} />}

      {/* Actions */}
      <div className="flex flex-col gap-3 pt-1">
        <button
          disabled={submitting || !deliveryDate || items.length === 0}
          onClick={handleSubmit}
          className="w-full py-3 rounded-[8px] text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #147BA6, #1F8A70)' }}
        >
          {submitting ? 'Sending…' : 'Send to Customer for Approval'}
        </button>
        <button
          onClick={onBack}
          disabled={submitting}
          className="w-full py-2.5 rounded-[8px] text-sm font-semibold text-gray-600 dark:text-[#8892A4] border border-gray-200 dark:border-[#252836] hover:bg-gray-50 dark:hover:bg-[#161921] transition-colors disabled:opacity-40"
        >
          ← Back to Edit
        </button>
      </div>
    </div>
  )
}

export default function CreateOrder() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const profile = useAsyncData<PortalWelcome>(() => fetchDistributorProfile(), [], 'sales-create-order:distributor')
  const distributorName = useMemo(() => profile.data?.company ?? profile.data?.name ?? null, [profile.data])

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-[#E8EAF0]">Create New Order</h1>
          <p className="text-sm text-gray-500 dark:text-[#8892A4] mt-0.5">Create an order on behalf of your distributor</p>
        </div>

        <StepIndicator step={step} />

        {step === 1 && <ConfirmDistributorStep onContinue={() => setStep(2)} />}
        {step === 2 && <AddProductsStep onBack={() => setStep(1)} onContinue={() => setStep(3)} />}
        {step === 3 && <ReviewStep distributorName={distributorName} onBack={() => setStep(2)} />}
      </div>
    </div>
  )
}
