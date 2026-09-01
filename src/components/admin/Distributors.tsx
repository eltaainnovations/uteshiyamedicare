import { Ban, Building2, CheckCircle, ChevronRight, Mail, MapPin, Phone, Search, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  fetchDistributorDetail,
  fetchDistributors,
  type DistributorDetail,
  type DistributorListItem,
} from '../../api/distributorsApi'
import { ApiError } from '../../types/auth'
import Pagination from '../common/Pagination'

const PAGE_SIZE = 20

export default function Distributors() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [customerGroup, setCustomerGroup] = useState('All')
  const [territory, setTerritory] = useState('All')
  const [page, setPage] = useState(1)

  const [items, setItems] = useState<DistributorListItem[]>([])
  const [total, setTotal] = useState(0)
  const [customerGroups, setCustomerGroups] = useState<string[]>([])
  const [territories, setTerritories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [detail, setDetail] = useState<DistributorDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  // Any filter change invalidates the current page number.
  useEffect(() => {
    setPage(1)
  }, [search, customerGroup, territory])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDistributors({
      search: search || undefined,
      customerGroup: customerGroup === 'All' ? undefined : customerGroup,
      territory: territory === 'All' ? undefined : territory,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setTotal(data.total)
        setCustomerGroups(data.customerGroups)
        setTerritories(data.territories)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load distributors.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [search, customerGroup, territory, page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    if (!selectedName) return
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    fetchDistributorDetail(selectedName)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setDetailError(err instanceof ApiError ? err.message : 'Could not load this distributor.')
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedName])

  // ── Detail view ──────────────────────────────────────────────────────

  if (selectedName) {
    return (
      <div className="p-5 lg:p-7 space-y-5">
        <button
          onClick={() => setSelectedName(null)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-[#8892A4] hover:text-[#147BA6] transition"
        >
          <ChevronRight size={14} className="rotate-180" /> Back to Distributors
        </button>

        {detailLoading && (
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
            Loading distributor…
          </div>
        )}

        {detailError && !detailLoading && (
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-red-200 dark:border-red-900/40 shadow-sm p-8 text-center text-sm text-red-600">
            {detailError}
          </div>
        )}

        {detail && !detailLoading && !detailError && (
          <>
            <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm p-6">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-[#E8EAF0]">{detail.customerName}</h2>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        detail.disabled
                          ? 'text-gray-500 bg-gray-100 dark:bg-[#252836] dark:text-[#8892A4]'
                          : 'text-green-700 bg-green-50'
                      }`}
                    >
                      {detail.disabled ? <Ban size={9} /> : <CheckCircle size={9} />}
                      {detail.disabled ? 'Disabled' : 'Active'}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-[#147BA6] mt-1.5 bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] px-2 py-0.5 rounded-[4px] inline-block">
                    {detail.name}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5 pt-5 border-t border-gray-100 dark:border-[#252836]">
                {[
                  ['Customer Group', detail.customerGroup ?? '—'],
                  ['Territory', detail.territory ?? '—'],
                  ['Customer Type', detail.customerType ?? '—'],
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin size={15} className="text-[#147BA6]" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Address</h3>
                </div>
                {detail.addresses.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-[#5A6075]">Not on file.</p>
                ) : (
                  <div className="space-y-4">
                    {detail.addresses.map((a) => (
                      <div key={a.name} className="pb-4 border-b last:border-0 last:pb-0 border-gray-100 dark:border-[#252836]">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          {a.addressType && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] text-[#147BA6]">
                              {a.addressType}
                            </span>
                          )}
                          {a.isPrimaryAddress && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#252836] text-gray-500 dark:text-[#8892A4]">
                              Primary
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 dark:text-[#C4C9D8] leading-relaxed">
                          {[a.addressLine1, a.addressLine2, a.city, a.state, a.pincode, a.country]
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <User size={15} className="text-[#147BA6]" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Contact</h3>
                </div>
                {detail.contacts.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-[#5A6075]">Not on file.</p>
                ) : (
                  <div className="space-y-4">
                    {detail.contacts.map((c) => (
                      <div key={c.name} className="pb-4 border-b last:border-0 last:pb-0 border-gray-100 dark:border-[#252836]">
                        <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">
                          {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.name}
                        </p>
                        <div className="mt-1.5 space-y-1">
                          {c.emailId && (
                            <p className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-[#8892A4]">
                              <Mail size={12} /> {c.emailId}
                            </p>
                          )}
                          {(c.mobileNo || c.phone) && (
                            <p className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-[#8892A4]">
                              <Phone size={12} /> {c.mobileNo || c.phone}
                            </p>
                          )}
                          {!c.emailId && !c.mobileNo && !c.phone && (
                            <p className="text-xs text-gray-400 dark:text-[#5A6075]">No email or phone on file.</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Distributors</h2>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
            {loading ? 'Loading…' : `${total} distributor${total === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by distributor name..."
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>
        <select
          value={customerGroup}
          onChange={(e) => setCustomerGroup(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
        >
          <option value="All">All Groups</option>
          {customerGroups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          value={territory}
          onChange={(e) => setTerritory(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
        >
          <option value="All">All Territories</option>
          {territories.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-red-200 dark:border-red-900/40 shadow-sm p-8 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {!error && loading && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
          Loading distributors…
        </div>
      )}

      {!error && !loading && items.length === 0 && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
          No distributors found.
        </div>
      )}

      {!error && !loading && items.length > 0 && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                  {['Distributor', 'Group', 'Territory', 'Status'].map((h) => (
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
                {items.map((d) => (
                  <tr
                    key={d.name}
                    onClick={() => setSelectedName(d.name)}
                    className="hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#147BA6] text-white flex items-center justify-center flex-shrink-0">
                          <Building2 size={14} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">{d.customerName}</p>
                          <p className="text-[10px] font-mono text-gray-400 dark:text-[#5A6075]">{d.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-[#8892A4]">{d.customerGroup ?? '—'}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-[#8892A4]">{d.territory ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          d.disabled ? 'text-gray-500 bg-gray-100 dark:bg-[#252836] dark:text-[#8892A4]' : 'text-green-700 bg-green-50'
                        }`}
                      >
                        {d.disabled ? <Ban size={9} /> : <CheckCircle size={9} />}
                        {d.disabled ? 'Disabled' : 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!error && !loading && total > 0 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  )
}
