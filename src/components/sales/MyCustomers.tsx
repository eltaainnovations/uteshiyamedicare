import { Ban, Building2, CheckCircle, ChevronRight, Mail, MapPin, Phone, Search, ShoppingCart, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchMyCustomerDetail, fetchMyCustomers, type PortalCustomerListItem } from '../../api/portalApi'
import type { DistributorDetail } from '../../api/distributorsApi'
import { ApiError } from '../../types/auth'

type StatusFilter = 'All' | 'Active' | 'Disabled'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function MyCustomers() {
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('All')

  const [items, setItems] = useState<PortalCustomerListItem[]>([])
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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchMyCustomers()
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load your customers.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedName) return
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    fetchMyCustomerDetail(selectedName)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setDetailError(err instanceof ApiError ? err.message : 'Could not load this customer.')
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedName])

  const filtered = items.filter((c) => {
    const matchesSearch = c.customerName.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = status === 'All' || (status === 'Active' ? !c.disabled : c.disabled)
    return matchesSearch && matchesStatus
  })

  // ── Detail view ──────────────────────────────────────────────────────

  if (selectedName) {
    return (
      <div className="p-5 lg:p-7 space-y-5">
        <button
          onClick={() => setSelectedName(null)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-[#8892A4] hover:text-[#147BA6] transition"
        >
          <ChevronRight size={14} className="rotate-180" /> Back to My Customers
        </button>

        {detailLoading && (
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
            Loading customer…
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
                <button
                  onClick={() => navigate('/sales/create-order')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-[8px] transition hover:brightness-95"
                  style={{ background: 'linear-gradient(135deg, #147BA6, #1F8A70)' }}
                >
                  <ShoppingCart size={14} />
                  Create Order
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5 pt-5 border-t border-gray-100 dark:border-[#252836]">
                {[
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
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">My Customers</h2>
        <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
          {loading ? 'Loading…' : `${filtered.length} customer${filtered.length === 1 ? '' : 's'} assigned to you`}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by distributor name..."
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#1A1D2E] text-gray-900 dark:text-[#E8EAF0] placeholder-gray-400 dark:placeholder-[#5A6075] transition"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#1A1D2E] text-gray-900 dark:text-[#E8EAF0] transition"
        >
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Disabled">Disabled</option>
        </select>
      </div>

      {error && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-red-200 dark:border-red-900/40 shadow-sm p-8 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {!error && loading && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
          Loading customers…
        </div>
      )}

      {!error && !loading && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                  {['Distributor Name', 'Territory', 'Last Order', 'Total Orders', 'Status', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-[#8892A4] uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400 dark:text-[#5A6075] text-sm">
                      No customers match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c, i) => (
                    <tr
                      key={c.name}
                      className={`border-b border-gray-50 dark:border-[#252836] last:border-0 hover:bg-gray-50/50 dark:hover:bg-[#161921]/60 transition-colors ${i % 2 === 1 ? 'bg-gray-50/30 dark:bg-[#161921]/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#147BA6] text-white flex items-center justify-center flex-shrink-0">
                            <Building2 size={14} />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-[#E8EAF0] whitespace-nowrap">{c.customerName}</p>
                            <p className="text-[10px] font-mono text-gray-400 dark:text-[#5A6075]">{c.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-[#8892A4]">{c.territory ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-[#8892A4] whitespace-nowrap">{formatDate(c.lastOrderDate)}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-900 dark:text-[#E8EAF0]">{c.totalOrders}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            c.disabled ? 'text-gray-500 bg-gray-100 dark:bg-[#252836] dark:text-[#8892A4]' : 'text-green-700 bg-green-50'
                          }`}
                        >
                          {c.disabled ? <Ban size={9} /> : <CheckCircle size={9} />}
                          {c.disabled ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedName(c.name)}
                            title="View customer"
                            className="p-1.5 rounded-[6px] text-[#147BA6] hover:bg-[#147BA6]/10 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => navigate('/sales/create-order')}
                            className="px-2.5 py-1 rounded-[6px] text-[10px] font-semibold text-white whitespace-nowrap"
                            style={{ background: '#1F8A70' }}
                          >
                            Create Order
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
