import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fetchDistributors, type DistributorListItem } from '../../api/distributorsApi'

interface DistributorTypeaheadProps {
  /** ERPNext Customer docname of the currently-selected distributor, or null. */
  value: string | null
  /** Display label for the currently-selected distributor, or null. */
  label: string | null
  onSelect: (name: string | null, label: string | null) => void
  placeholder?: string
  /** Show territory instead of the ERPNext docname as the result subtitle —
   * more useful than a raw docname when picking a distributor by name/area
   * (e.g. Add User) rather than filtering existing records by it. */
  showTerritory?: boolean
  disabled?: boolean
}

/** Debounced search-and-pick control backed by GET /distributors — a plain
 * <select> isn't usable with 300+ distributors. */
export default function DistributorTypeahead({
  value,
  label,
  onSelect,
  placeholder = 'Search distributor...',
  showTerritory = false,
  disabled = false,
}: DistributorTypeaheadProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<DistributorListItem[]>([])
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
      fetchDistributors({ search: query.trim(), page: 1, pageSize: 8 })
        .then((data) => {
          if (!cancelled) setSuggestions(data.items)
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

  function handleSelect(d: DistributorListItem) {
    onSelect(d.name, d.customerName)
    setQuery('')
    setOpen(false)
  }

  function handleClear() {
    onSelect(null, null)
    setQuery('')
  }

  if (value && label) {
    return (
      <div className="flex items-center gap-1.5 pl-3 pr-2 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] rounded-[8px] min-w-48">
        <span className="text-gray-700 dark:text-[#E8EAF0] truncate flex-1">{label}</span>
        <button
          onClick={handleClear}
          disabled={disabled}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-[#E8EAF0] transition flex-shrink-0 disabled:opacity-50"
          aria-label="Clear distributor filter"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative min-w-48">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition disabled:opacity-50"
      />
      {open && query.trim() && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white dark:bg-[#1A1D2E] border border-gray-100 dark:border-[#252836] rounded-[8px] shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-gray-400 dark:text-[#5A6075]">Searching…</div>}
          {!loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-[#5A6075]">No distributors found.</div>
          )}
          {!loading &&
            suggestions.map((d) => (
              <button
                key={d.name}
                onClick={() => handleSelect(d)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-[#1F2233] transition"
              >
                <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">{d.customerName}</p>
                <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">
                  {showTerritory ? d.territory ?? 'No territory' : <span className="font-mono">{d.name}</span>}
                </p>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
