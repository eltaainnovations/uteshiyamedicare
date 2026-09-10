import { Package, Search, ShoppingCart } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  fetchPortalProductVariants,
  fetchPortalProducts,
  type PortalProduct,
  type PortalProductVariant,
  type PortalProductVariants,
  type StockStatus,
} from '../../api/portalApi'
import { useCart } from '../../context/CartContext'
import { ApiError } from '../../types/auth'
import { formatInr } from '../../utils/currency'
import Pagination from '../common/Pagination'
import PageSizeSelect from '../common/PageSizeSelect'

type SortKey = 'price_asc' | 'price_desc' | 'name_asc'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name_asc', label: 'Name: A–Z' },
]

const STOCK_BADGE: Record<StockStatus, { label: string; cls: string }> = {
  in_stock: { label: 'In Stock', cls: 'bg-green-100 text-green-700' },
  low_stock: { label: 'Low Stock', cls: 'bg-amber-100 text-amber-700' },
  out_of_stock: { label: 'Out of Stock', cls: 'bg-red-100 text-red-700' },
}

// Variants are fetched per product on demand; cache so paging back and
// forth (or re-sorting) doesn't refetch. Module-level, cleared on reload.
const variantsCache = new Map<string, PortalProductVariants>()

function variantChipLabel(v: PortalProductVariant): string {
  if (v.attributes.length > 0) return v.attributes.map((a) => a.value).join(' · ')
  return v.itemCode
}

function discountPct(price: number | null, listPrice: number | null): number {
  if (price == null || listPrice == null || listPrice <= price) return 0
  return Math.round((1 - price / listPrice) * 100)
}

interface ActiveSku {
  itemCode: string
  name: string
  price: number | null
  listPrice: number | null
  stockStatus: StockStatus
}

function ProductCard({ product }: { product: PortalProduct }) {
  const { add, items, openCart } = useCart()
  const [variants, setVariants] = useState<PortalProductVariant[] | null>(
    variantsCache.get(product.itemCode)?.variants ?? null,
  )
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [showAllVariants, setShowAllVariants] = useState(false)
  const [qty, setQty] = useState(1)

  useEffect(() => {
    if (!product.hasVariants) return
    const cached = variantsCache.get(product.itemCode)
    if (cached) {
      setVariants(cached.variants)
      return
    }
    let cancelled = false
    fetchPortalProductVariants(product.itemCode)
      .then((data) => {
        if (cancelled) return
        variantsCache.set(product.itemCode, data)
        setVariants(data.variants)
      })
      .catch(() => {
        /* leave chips hidden; the template-level price/stock still render */
      })
    return () => {
      cancelled = true
    }
  }, [product.itemCode, product.hasVariants])

  // Default to the first in-stock variant once they load.
  useEffect(() => {
    if (variants && selectedCode == null) {
      const firstInStock = variants.find((v) => v.stockStatus !== 'out_of_stock')
      setSelectedCode((firstInStock ?? variants[0])?.itemCode ?? null)
    }
  }, [variants, selectedCode])

  const selected = variants?.find((v) => v.itemCode === selectedCode) ?? null

  const active: ActiveSku = selected
    ? {
        itemCode: selected.itemCode,
        name: `${product.itemName} — ${variantChipLabel(selected)}`,
        price: selected.price,
        listPrice: selected.listPrice,
        stockStatus: selected.stockStatus,
      }
    : {
        itemCode: product.itemCode,
        name: product.itemName,
        price: product.price,
        listPrice: product.listPrice,
        stockStatus: product.stockStatus,
      }

  // A template with variants still loading can't be added yet — you must
  // pick a real SKU first.
  const awaitingVariant = product.hasVariants && selected == null
  const inCartLine = items.find((i) => i.itemCode === active.itemCode)
  const outOfStock = active.stockStatus === 'out_of_stock'
  const badge = STOCK_BADGE[active.stockStatus]
  const discount = discountPct(active.price, active.listPrice)

  function handleAdd() {
    if (active.price == null || awaitingVariant) return
    add(
      {
        itemCode: active.itemCode,
        name: active.name,
        price: active.price,
        listPrice: active.listPrice,
        image: product.image,
      },
      qty,
    )
  }

  return (
    <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden hover:shadow-md dark:hover:border-[#353848] transition">
      <div className="relative h-36 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#161921] dark:to-[#1A1D2E] flex items-center justify-center">
        {product.image ? (
          <img src={product.image} alt={product.itemName} className="w-full h-full object-cover" />
        ) : (
          <Package size={40} className="text-gray-300 dark:text-[#353848]" />
        )}
        {discount > 0 && (
          <span className="absolute top-3 left-3 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500 text-white">
            −{discount}%
          </span>
        )}
      </div>

      <div className="p-4">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
        <p className="text-xs font-mono text-gray-400 dark:text-[#5A6075] mt-1.5">{product.itemCode}</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] leading-tight mt-0.5 line-clamp-2">
          {product.itemName}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-[#5A6075] mt-1">{product.itemGroup}</p>

        {product.hasVariants && (
          <div className="flex flex-wrap gap-1 mt-2 min-h-[20px]">
            {variants == null ? (
              <span className="text-[10px] text-gray-400 dark:text-[#5A6075]">Loading variants…</span>
            ) : (
              <>
                {(showAllVariants ? variants : variants.slice(0, 3)).map((v) => (
                  <button
                    key={v.itemCode}
                    onClick={() => setSelectedCode(v.itemCode)}
                    title={v.stockStatus === 'out_of_stock' ? `${variantChipLabel(v)} — Out of Stock` : variantChipLabel(v)}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border transition ${
                      selectedCode === v.itemCode
                        ? 'border-[#147BA6] bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] text-[#147BA6]'
                        : v.stockStatus === 'out_of_stock'
                          ? 'border-gray-100 dark:border-[#1E2130] text-gray-300 dark:text-[#5A6075] line-through'
                          : 'border-gray-200 dark:border-[#252836] text-gray-500 dark:text-[#8892A4] hover:border-[#147BA6]'
                    }`}
                  >
                    {variantChipLabel(v)}
                  </button>
                ))}
                {variants.length > 3 && (
                  <button
                    onClick={() => setShowAllVariants((s) => !s)}
                    className="text-[10px] px-1 py-0.5 text-[#147BA6] hover:underline"
                  >
                    {showAllVariants ? 'less' : `+${variants.length - 3}`}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex items-baseline gap-2 mt-2">
          {active.price != null ? (
            <span className="text-base font-bold text-gray-900 dark:text-[#E8EAF0]">{formatInr(active.price)}</span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-[#5A6075]">Price not set</span>
          )}
          {discount > 0 && active.listPrice != null && (
            <span className="text-xs text-gray-400 dark:text-[#5A6075] line-through">
              {formatInr(active.listPrice)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center border border-gray-200 dark:border-[#252836] rounded-[6px] overflow-hidden bg-white dark:bg-[#13161F]">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="px-2 py-1 text-gray-500 dark:text-[#8892A4] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition text-sm"
            >
              −
            </button>
            <span className="px-2 text-xs font-bold text-gray-900 dark:text-[#E8EAF0]">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="px-2 py-1 text-gray-500 dark:text-[#8892A4] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition text-sm"
            >
              +
            </button>
          </div>

          {outOfStock ? (
            <button
              disabled
              className="flex-1 py-1.5 text-xs font-semibold rounded-[6px] bg-gray-100 dark:bg-[#1E2130] text-gray-400 dark:text-[#5A6075] cursor-not-allowed"
            >
              Unavailable
            </button>
          ) : inCartLine ? (
            <button
              onClick={openCart}
              className="flex-1 py-1.5 text-xs font-semibold rounded-[6px] bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.2)] text-[#147BA6] hover:bg-[#d0ebf7] dark:hover:bg-[rgba(20,123,166,0.3)] transition flex items-center justify-center gap-1"
            >
              <ShoppingCart size={11} />
              In Cart ({inCartLine.qty})
            </button>
          ) : (
            <button
              onClick={handleAdd}
              disabled={awaitingVariant || active.price == null}
              className="flex-1 py-1.5 text-xs font-semibold rounded-[6px] text-white transition hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              style={{ background: '#147BA6' }}
            >
              <ShoppingCart size={11} />
              Add to Cart
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DistProductCatalogue() {
  const { count: cartCount, openCart } = useCart()

  const [cat, setCat] = useState('All')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('name_asc')

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
    fetchPortalProducts({
      search: search || undefined,
      category: cat === 'All' ? undefined : cat,
      page,
      pageSize,
    })
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

  // Client-side sort of the current page. Price isn't an ERPNext Item
  // column, so it can't be a server order_by — and the page is what the
  // shopper is looking at.
  const sorted = useMemo(() => {
    const copy = [...products]
    if (sort === 'name_asc') return copy.sort((a, b) => a.itemName.localeCompare(b.itemName))
    const dir = sort === 'price_asc' ? 1 : -1
    return copy.sort((a, b) => {
      const pa = a.price ?? (sort === 'price_asc' ? Infinity : -Infinity)
      const pb = b.price ?? (sort === 'price_asc' ? Infinity : -Infinity)
      return (pa - pb) * dir
    })
  }, [products, sort])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Product Catalogue</h2>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
            {loading ? 'Loading…' : `${total.toLocaleString('en-IN')} products available`}
          </p>
        </div>
        <button
          onClick={openCart}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-[10px] transition hover:brightness-95"
          style={{ background: '#147BA6' }}
        >
          <ShoppingCart size={15} />
          View Cart{cartCount > 0 && ` (${cartCount})`}
        </button>
      </div>

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
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          aria-label="Sort products"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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

      {!error && !loading && sorted.length === 0 && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
          No products found.
        </div>
      )}

      {!error && !loading && sorted.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((p) => (
            <ProductCard key={p.itemCode} product={p} />
          ))}
        </div>
      )}

      {!error && !loading && total > 0 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  )
}
