import { AlertCircle, CheckCircle, Eye, EyeOff, Mail, Shield } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { changeOwnPassword } from '../../api/usersApi'
import { useAuth } from '../../context/AuthContext'
import { ApiError, type Role } from '../../types/auth'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  distributor: 'Distributor',
  sales_person: 'Sales Person',
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Profile() {
  const { user } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!user) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setSubmitting(true)
    try {
      const detail = await changeOwnPassword(currentPassword, newPassword)
      setSuccess(detail)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-5 lg:p-7 space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Profile</h2>
        <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">Your account details and password</p>
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#147BA6] text-white text-lg font-bold flex items-center justify-center flex-shrink-0">
            {initialsFromName(user.name)}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-gray-900 dark:text-[#E8EAF0] truncate">{user.name}</p>
            <p className="text-sm text-gray-500 dark:text-[#8892A4] flex items-center gap-1.5 mt-0.5 truncate">
              <Mail size={13} className="flex-shrink-0" /> {user.email}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-[#252836] flex items-center gap-2">
          <Shield size={14} className="text-gray-400 dark:text-[#5A6075]" />
          <span className="text-xs text-gray-500 dark:text-[#8892A4]">Role</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#e8f4fa] text-[#147BA6] dark:bg-[rgba(20,123,166,0.15)]">
            {ROLE_LABELS[user.role]}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-[#252836]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Change Password</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-[8px] px-3 py-2.5">
              <AlertCircle size={13} className="flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-[8px] px-3 py-2.5">
              <CheckCircle size={13} className="flex-shrink-0" />
              {success}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-[#C4C9D8] mb-1.5">Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-[8px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075] hover:text-gray-600 dark:hover:text-[#96A0B4]"
              >
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-[#C4C9D8] mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-[8px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075] hover:text-gray-600 dark:hover:text-[#96A0B4]"
              >
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-[#C4C9D8] mb-1.5">Confirm New Password</label>
            <input
              type={showNew ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-[8px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2.5 text-sm font-semibold text-white rounded-[8px] transition hover:brightness-95 disabled:opacity-60"
            style={{ background: '#147BA6' }}
          >
            {submitting ? 'Changing…' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
