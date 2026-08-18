import { AlertCircle, Ban, CheckCircle, Clock, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createPortalUser,
  disablePortalUser,
  listPortalUsers,
  type PortalUser,
  type PortalUserStatus,
} from '../../api/usersApi'
import { ApiError, type Role } from '../../types/auth'

const ROLE_OPTIONS: Role[] = ['admin', 'manager', 'distributor', 'sales_person']
const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  distributor: 'Distributor',
  sales_person: 'Sales Person',
}
const ROLE_BADGE_CLS: Record<Role, string> = {
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  distributor: 'bg-emerald-100 text-emerald-700',
  sales_person: 'bg-cyan-100 text-cyan-700',
}
const STATUS_OPTIONS: PortalUserStatus[] = ['draft', 'active', 'failed', 'disabled']
const STATUS_LABELS: Record<PortalUserStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  failed: 'Failed',
  disabled: 'Disabled',
}
const STATUS_INFO: Record<PortalUserStatus, { cls: string; icon: typeof CheckCircle }> = {
  draft: { cls: 'text-amber-700 bg-amber-50', icon: Clock },
  active: { cls: 'text-green-700 bg-green-50', icon: CheckCircle },
  failed: { cls: 'text-red-600 bg-red-50', icon: AlertCircle },
  disabled: { cls: 'text-gray-500 bg-gray-100 dark:bg-[#252836] dark:text-[#8892A4]', icon: Ban },
}
const REQUIRES_LINK: Role[] = ['distributor', 'sales_person']

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?'
}

interface CreateFormState {
  email: string
  firstName: string
  lastName: string
  portalRole: Role
  erpnextCustomerLink: string
}

const EMPTY_FORM: CreateFormState = {
  email: '',
  firstName: '',
  lastName: '',
  portalRole: 'distributor',
  erpnextCustomerLink: '',
}

export default function UserManagement() {
  const [users, setUsers] = useState<PortalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<PortalUserStatus | 'All'>('All')

  const [disablingEmail, setDisablingEmail] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CreateFormState, string>>>({})
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdUser, setCreatedUser] = useState<PortalUser | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listPortalUsers()
      .then((data) => {
        if (!cancelled) setUsers(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load users.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      const matchSearch =
        !q ||
        u.email.toLowerCase().includes(q) ||
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q)
      const matchRole = roleFilter === 'All' || u.portalRole === roleFilter
      const matchStatus = statusFilter === 'All' || u.status === statusFilter
      return matchSearch && matchRole && matchStatus
    })
  }, [users, search, roleFilter, statusFilter])

  function openModal() {
    setForm(EMPTY_FORM)
    setFormErrors({})
    setCreateError(null)
    setCreatedUser(null)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
  }

  function handleCreateSubmit(event: FormEvent) {
    event.preventDefault()
    const errors: Partial<Record<keyof CreateFormState, string>> = {}
    if (!form.email.trim()) errors.email = 'Email is required.'
    if (!form.firstName.trim()) errors.firstName = 'First name is required.'
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.'
    if (REQUIRES_LINK.includes(form.portalRole) && !form.erpnextCustomerLink.trim()) {
      errors.erpnextCustomerLink = 'Required for Distributor and Sales Person roles.'
    }
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    setCreateError(null)
    setCreateSubmitting(true)
    createPortalUser({
      email: form.email.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      portalRole: form.portalRole,
      erpnextCustomerLink: REQUIRES_LINK.includes(form.portalRole) ? form.erpnextCustomerLink.trim() : undefined,
    })
      .then((created) => {
        setUsers((prev) => [created, ...prev])
        setCreatedUser(created)
      })
      .catch((err: unknown) => {
        setCreateError(err instanceof ApiError ? err.message : 'Could not create this user. Please try again.')
      })
      .finally(() => setCreateSubmitting(false))
  }

  function handleDisable(user: PortalUser) {
    if (!window.confirm(`Disable ${user.firstName} ${user.lastName} (${user.email})? They will immediately lose Portal access.`)) {
      return
    }
    setRowError(null)
    setDisablingEmail(user.email)
    disablePortalUser(user.email)
      .then((updated) => {
        setUsers((prev) => prev.map((u) => (u.email === updated.email ? updated : u)))
      })
      .catch((err: unknown) => {
        setRowError(err instanceof ApiError ? err.message : `Could not disable ${user.email}.`)
      })
      .finally(() => setDisablingEmail(null))
  }

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">User Management</h2>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
            {loading ? 'Loading…' : `${users.length} total portal user${users.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white font-medium rounded-[10px] transition"
          style={{ background: '#147BA6' }}
        >
          <Plus size={15} />
          Add User
        </button>
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | 'All')}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
        >
          <option value="All">All Roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PortalUserStatus | 'All')}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
        >
          <option value="All">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {rowError && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-red-200 dark:border-red-900/40 shadow-sm p-4 text-sm text-red-600">
          {rowError}
        </div>
      )}

      {error && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-red-200 dark:border-red-900/40 shadow-sm p-8 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {!error && loading && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
          Loading users…
        </div>
      )}

      {!error && !loading && filtered.length === 0 && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
          No users found.
        </div>
      )}

      {!error && !loading && filtered.length > 0 && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                  {['User', 'Role', 'Linked Distributor', 'Status', 'Actions'].map((h) => (
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
                {filtered.map((u) => {
                  const si = STATUS_INFO[u.status]
                  const StatusIcon = si.icon
                  const showLink = REQUIRES_LINK.includes(u.portalRole)
                  return (
                    <tr key={u.email} className="hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#147BA6] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {initials(u.firstName, u.lastName)}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE_CLS[u.portalRole]}`}>
                          {ROLE_LABELS[u.portalRole]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-[#8892A4]">
                        {showLink && u.erpnextCustomerLink ? u.erpnextCustomerLink : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          title={u.status === 'failed' && u.failureReason ? u.failureReason : undefined}
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${si.cls}`}
                        >
                          <StatusIcon size={9} />
                          {STATUS_LABELS[u.status]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {u.status === 'active' ? (
                          <button
                            onClick={() => handleDisable(u)}
                            disabled={disablingEmail === u.email}
                            className="text-xs px-3 py-1.5 border border-red-200 dark:border-red-900/40 rounded-[8px] text-red-600 hover:bg-red-50 dark:hover:bg-[rgba(220,38,38,0.1)] transition disabled:opacity-50"
                          >
                            {disablingEmail === u.email ? 'Disabling…' : 'Disable'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-[#353848]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[16px] w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-[#252836]">
              <h3 className="text-base font-semibold text-gray-900 dark:text-[#E8EAF0]">Add New User</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-[#E8EAF0] transition">
                <X size={18} />
              </button>
            </div>

            {createdUser ? (
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-[10px] bg-amber-50 border border-amber-200">
                  <Clock size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    <strong>
                      {createdUser.firstName} {createdUser.lastName}
                    </strong>{' '}
                    was added with status <strong>Draft</strong> — pending admin approval. They will not be able to
                    log in until the approval email is actioned and provisioning succeeds.
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="w-full py-2 text-sm text-white rounded-[8px] font-semibold transition"
                  style={{ background: '#147BA6' }}
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateSubmit}>
                <div className="p-6 space-y-4">
                  {createError && (
                    <p className="px-3 py-2 rounded-[8px] bg-red-50 border border-red-200 text-red-700 text-xs">
                      {createError}
                    </p>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-[#B0BAD0] mb-1.5">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="user@example.com"
                      disabled={createSubmitting}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
                    />
                    {formErrors.email && <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-[#B0BAD0] mb-1.5">First Name</label>
                      <input
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                        disabled={createSubmitting}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
                      />
                      {formErrors.firstName && <p className="mt-1 text-xs text-red-600">{formErrors.firstName}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-[#B0BAD0] mb-1.5">Last Name</label>
                      <input
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        disabled={createSubmitting}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
                      />
                      {formErrors.lastName && <p className="mt-1 text-xs text-red-600">{formErrors.lastName}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-[#B0BAD0] mb-1.5">Portal Role</label>
                    <select
                      value={form.portalRole}
                      onChange={(e) => setForm({ ...form, portalRole: e.target.value as Role })}
                      disabled={createSubmitting}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {REQUIRES_LINK.includes(form.portalRole) && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-[#B0BAD0] mb-1.5">
                        Linked Distributor
                      </label>
                      <input
                        value={form.erpnextCustomerLink}
                        onChange={(e) => setForm({ ...form, erpnextCustomerLink: e.target.value })}
                        placeholder="ERPNext Customer ID (e.g. CUST-00023)"
                        disabled={createSubmitting}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
                      />
                      {formErrors.erpnextCustomerLink && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.erpnextCustomerLink}</p>
                      )}
                      <p className="mt-1 text-[10px] text-gray-400 dark:text-[#5A6075]">
                        Temporary free-text field until Distributor Management is live.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-[#252836]">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={createSubmitting}
                    className="flex-1 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] text-gray-600 dark:text-[#B0BAD0] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createSubmitting}
                    className="flex-1 py-2 text-sm text-white rounded-[8px] font-semibold transition disabled:opacity-70"
                    style={{ background: '#147BA6' }}
                  >
                    {createSubmitting ? 'Creating…' : 'Create User'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
