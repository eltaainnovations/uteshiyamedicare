import { ChevronLeft, ChevronRight, Filter, Grid, List, Package, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  fetchProductDetail,
  fetchProducts,
  type ProductDetail,
  type ProductListItem,
  type ProductVariant,
} from '../../api/productsApi'
import { ApiError } from '../../types/auth'

type ViewMode = 'grid' | 'list'
type DetailTab = 'Description' | 'Specifications' | 'Variants Table'
const ALL_DETAIL_TABS: DetailTab[] = ['Description', 'Specifications', 'Variants Table']
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const

/** Windowed page numbers with "…" gaps — e.g. [1, '…', 4, 5, 6, '…', 42]. */
function buildPageWindow(current: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1])
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b)

  const result: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…')
    result.push(sorted[i])
  }
  return result
}

function formatFullInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

function formatShortInr(amount: number): string {
  return `₹${(amount / 1000).toFixed(0)}K`
}

function stockLabel(stock: number): { label: string; badgeCls: string; textCls: string } {
  if (stock === 0) return { label: 'Out of Stock', badgeCls: 'bg-red-100 text-red-700', textCls: 'text-red-600' }
  if (stock <= 5) return { label: 'Low Stock', badgeCls: 'bg-amber-100 text-amber-700', textCls: 'text-amber-600' }
  return {
    label: 'In Stock',
    badgeCls: 'bg-green-100 text-green-700',
    textCls: 'text-gray-700 dark:text-[#C4C9D8]',
  }
}

function variantLabel(v: ProductVariant): string {
  if (v.attributes.length > 0) return v.attributes.map((a) => `${a.attribute}: ${a.value}`).join(' · ')
  return v.itemName
}

export default function ProductCatalogue() {
  const [view, setView] = useState<ViewMode>('list')
  const [cat, setCat] = useState('All')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  const [products, setProducts] = useState<ProductListItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [detailItemCode, setDetailItemCode] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [selectedVariantCode, setSelectedVariantCode] = useState('')
  const [detailTab, setDetailTab] = useState<DetailTab>('Description')

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  // Any filter/page-size change invalidates the current page number.
  useEffect(() => {
    
    setPage(1)
  }, [search, cat, pageSize])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchProducts({ search: search || undefined, category: cat === 'All' ? undefined : cat, page, pageSize })
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
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  useEffect(() => {
    if (!detailItemCode) return
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    fetchProductDetail(detailItemCode)
      .then((data) => {
        if (cancelled) return
        setDetail(data)
        const firstInStock = data.variants.find((v) => v.stock > 0)
        setSelectedVariantCode((firstInStock ?? data.variants[0])?.itemCode ?? '')
        setDetailTab('Description')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setDetailError(err instanceof ApiError ? err.message : 'Could not load this product.')
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailItemCode])

  // ── Detail view ──────────────────────────────────────────────────────

  if (detailItemCode) {
    const selectedVariant = detail?.variants.find((v) => v.itemCode === selectedVariantCode) ?? detail?.variants[0]
    const tabs =
      detail && detail.specifications.length > 0
        ? ALL_DETAIL_TABS
        : ALL_DETAIL_TABS.filter((t) => t !== 'Specifications')

    return (
      <div className="p-5 lg:p-7 space-y-5">
        <button
          onClick={() => setDetailItemCode(null)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-[#8892A4] hover:text-[#147BA6] transition"
        >
          <ChevronRight size={14} className="rotate-180" /> Back to Catalogue
        </button>

        {detailLoading && (
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
            Loading product…
          </div>
        )}

        {detailError && !detailLoading && (
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-red-200 dark:border-red-900/40 shadow-sm p-8 text-center text-sm text-red-600">
            {detailError}
          </div>
        )}

        {detail && selectedVariant && !detailLoading && !detailError && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2">
                <div className="rounded-[16px] bg-gray-50 dark:bg-[#161921] aspect-square flex items-center justify-center border border-gray-100 dark:border-[#252836] overflow-hidden">
                  {detail.image ? (
                    <img src={detail.image} alt={detail.itemName} className="w-full h-full object-cover" />
                  ) : (
                    <Package size={64} className="text-gray-300 dark:text-[#353848]" />
                  )}
                </div>
              </div>

              <div className="lg:col-span-3 space-y-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 dark:text-[#5A6075]">{detail.itemGroup}</span>
                    {detail.hasVariants && (
                      <>
                        <span className="text-xs text-gray-300 dark:text-[#353848]">·</span>
                        <span className="text-xs font-semibold text-[#147BA6]">
                          {detail.variants.length} Variants
                        </span>
                      </>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-[#E8EAF0] mt-2 leading-tight">
                    {detail.itemName}
                  </h2>
                  <p className="text-xs font-mono text-[#147BA6] mt-1.5 bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] px-2 py-0.5 rounded-[4px] inline-block">
                    {selectedVariant.itemCode}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {(() => {
                    const s = stockLabel(selectedVariant.stock)
                    return (
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${s.badgeCls}`}>
                        {s.label}
                      </span>
                    )
                  })()}
                  <span className="text-xs text-gray-500 dark:text-[#8892A4]">
                    {selectedVariant.stock} units in stock
                  </span>
                </div>

                <div className="flex items-baseline gap-3 flex-wrap">
                  {selectedVariant.price != null ? (
                    <span className="text-2xl font-bold text-[#1F8A70]">{formatFullInr(selectedVariant.price)}</span>
                  ) : (
                    <span className="text-sm text-gray-400 dark:text-[#5A6075]">Price not set</span>
                  )}
                </div>

                {detail.hasVariants && (
                  <div>
                    <label
                      htmlFor="variant-select"
                      className="text-xs font-semibold text-gray-500 dark:text-[#8892A4] mb-2 uppercase tracking-wide block"
                    >
                      Variant
                    </label>
                    <select
                      id="variant-select"
                      value={selectedVariantCode}
                      onChange={(e) => setSelectedVariantCode(e.target.value)}
                      className="w-full max-w-sm px-3.5 py-2 text-sm rounded-[8px] border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] outline-none focus:border-[#147BA6] transition"
                    >
                      {detail.variants.map((v) => (
                        <option key={v.itemCode} value={v.itemCode} disabled={v.stock === 0}>
                          {variantLabel(v)}
                          {v.stock === 0 ? ' — Out of Stock' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 dark:border-[#252836] flex overflow-x-auto">
                {tabs.map((t) => (
                  <button
                    key={t}
                    onClick={() => setDetailTab(t)}
                    className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      detailTab === t
                        ? 'border-[#147BA6] text-[#147BA6]'
                        : 'border-transparent text-gray-500 dark:text-[#8892A4] hover:text-gray-700 dark:hover:text-[#E8EAF0]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="p-5 lg:p-6">
                {detailTab === 'Description' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-700 dark:text-[#C4C9D8] leading-relaxed">
                      {detail.description || 'No description available.'}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                      {[
                        ['Category', detail.itemGroup],
                        ['Item Code', detail.itemCode],
                        ['Variants', detail.hasVariants ? `${detail.variants.length} options` : 'Single SKU'],
                        ['Total Stock', `${detail.variants.reduce((s, v) => s + v.stock, 0)} units`],
                      ].map(([k, v]) => (
                        <div key={k} className="bg-gray-50 dark:bg-[#161921] rounded-[8px] p-3">
                          <p className="text-[10px] font-medium text-gray-400 dark:text-[#5A6075] uppercase tracking-wide">
                            {k}
                          </p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] mt-0.5">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detailTab === 'Specifications' && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <tbody className="divide-y divide-gray-50 dark:divide-[#252836]">
                        {detail.specifications.map((spec) => (
                          <tr key={spec.key}>
                            <td className="py-3 pr-8 text-xs font-semibold text-gray-500 dark:text-[#8892A4] w-48 whitespace-nowrap">
                              {spec.key}
                            </td>
                            <td className="py-3 text-sm text-gray-900 dark:text-[#E8EAF0]">{spec.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {detailTab === 'Variants Table' && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-[#252836]">
                          {['Variant SKU', 'Attributes', 'Stock', 'Price', 'Status'].map((h) => (
                            <th
                              key={h}
                              className="pb-3 pr-5 text-left text-xs font-semibold text-gray-500 dark:text-[#5A6075] uppercase tracking-wide whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-[#252836]">
                        {detail.variants.map((v) => {
                          const s = stockLabel(v.stock)
                          return (
                            <tr key={v.itemCode} className="hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition">
                              <td className="py-3 pr-5 text-xs font-mono font-semibold text-[#147BA6] whitespace-nowrap">
                                {v.itemCode}
                              </td>
                              <td className="py-3 pr-5 text-sm text-gray-900 dark:text-[#E8EAF0]">
                                {v.attributes.length > 0
                                  ? v.attributes.map((a) => `${a.attribute}: ${a.value}`).join(', ')
                                  : v.itemName}
                              </td>
                              <td className="py-3 pr-5">
                                <span className={`text-xs font-bold ${s.textCls}`}>{v.stock}</span>
                              </td>
                              <td className="py-3 pr-5 text-sm font-semibold text-[#1F8A70]">
                                {v.price != null ? formatFullInr(v.price) : '—'}
                              </td>
                              <td className="py-3">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.badgeCls}`}>
                                  {s.label}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── List / Grid view ─────────────────────────────────────────────────

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Product Catalogue</h2>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
            {loading
              ? 'Loading…'
              : total === 0
                ? '0 products'
                : `Showing ${rangeStart.toLocaleString('en-IN')}–${rangeEnd.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} products`}
          </p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {['All', ...categories].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition ${
              cat === c
                ? 'bg-[#147BA6] text-white'
                : 'bg-white dark:bg-[#1A1D2E] text-gray-600 dark:text-[#8892A4] border border-gray-200 dark:border-[#252836] hover:border-gray-300'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm flex gap-3 items-center">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]"
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or SKU..."
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] text-gray-600 dark:text-[#96A0B4] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition">
          <Filter size={13} /> Filters
        </button>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          title="Products per page"
          className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>
        <div className="flex border border-gray-200 dark:border-[#252836] rounded-[8px] overflow-hidden">
          <button
            onClick={() => setView('list')}
            className={`p-2 transition ${
              view === 'list'
                ? 'bg-[#147BA6] text-white'
                : 'text-gray-500 dark:text-[#5A6075] hover:bg-gray-50 dark:hover:bg-[#1F2233]'
            }`}
          >
            <List size={15} />
          </button>
          <button
            onClick={() => setView('grid')}
            className={`p-2 transition ${
              view === 'grid'
                ? 'bg-[#147BA6] text-white'
                : 'text-gray-500 dark:text-[#5A6075] hover:bg-gray-50 dark:hover:bg-[#1F2233]'
            }`}
          >
            <Grid size={15} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-red-200 dark:border-red-900/40 shadow-sm p-8 text-center text-sm text-red-600">
          {error}
        </div>
      )}

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
        view === 'list' ? (
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                    {['Item Code', 'Product', 'Category', 'Variants', 'From Price', 'Stock'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#5A6075] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#252836]">
                  {products.map((p) => (
                    <tr key={p.itemCode} className="hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition">
                      <td className="px-4 py-3 text-xs font-mono text-[#147BA6] font-semibold whitespace-nowrap">
                        {p.itemCode}
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        <button
                          onClick={() => setDetailItemCode(p.itemCode)}
                          className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0] hover:text-[#147BA6] text-left transition"
                        >
                          {p.itemName}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-gray-600 dark:text-[#8892A4] bg-gray-100 dark:bg-[#252836] px-2 py-0.5 rounded-full">
                          {p.itemGroup}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] text-[#147BA6]">
                          {p.hasVariants ? 'Multiple' : 'Single SKU'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#1F8A70]">
                        {p.fromPrice != null ? `from ${formatShortInr(p.fromPrice)}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-semibold ${
                            p.totalStock === 0
                              ? 'text-red-600'
                              : p.totalStock <= 10
                                ? 'text-amber-600'
                                : 'text-gray-700 dark:text-[#C4C9D8]'
                          }`}
                        >
                          {p.totalStock}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((p) => (
              <div
                key={p.itemCode}
                className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden hover:shadow-md dark:hover:border-[#353848] transition p-4"
              >
                <p className="text-xs font-mono text-[#147BA6]">{p.itemCode}</p>
                <button
                  onClick={() => setDetailItemCode(p.itemCode)}
                  className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] mt-0.5 leading-tight text-left hover:text-[#147BA6] transition line-clamp-2 block"
                >
                  {p.itemName}
                </button>
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-[#252836] text-gray-500 dark:text-[#8892A4]">
                    {p.itemGroup}
                  </span>
                  {p.hasVariants && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] text-[#147BA6] font-semibold">
                      Multiple Variants
                    </span>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#252836] flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">from</p>
                    <p className="text-sm font-bold text-[#1F8A70]">
                      {p.fromPrice != null ? formatShortInr(p.fromPrice) : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">Stock</p>
                    <p
                      className={`text-sm font-bold ${
                        p.totalStock === 0 ? 'text-red-600' : 'text-gray-900 dark:text-[#E8EAF0]'
                      }`}
                    >
                      {p.totalStock}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDetailItemCode(p.itemCode)}
                  className="w-full mt-3 text-xs py-1.5 rounded-[6px] text-white transition"
                  style={{ background: '#147BA6' }}
                >
                  View
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {!error && !loading && total > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs text-gray-500 dark:text-[#8892A4]">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 flex items-center justify-center rounded-[6px] text-gray-500 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition"
            >
              <ChevronLeft size={15} />
            </button>
            {buildPageWindow(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span
                  key={`ellipsis-${i}`}
                  className="w-8 h-8 flex items-center justify-center text-xs text-gray-400 dark:text-[#5A6075]"
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 text-xs rounded-[6px] transition ${
                    p === page
                      ? 'bg-[#147BA6] text-white'
                      : 'text-gray-600 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233]'
                  }`}
                >
                  {p}
                </button>
              ),
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-[6px] text-gray-500 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
