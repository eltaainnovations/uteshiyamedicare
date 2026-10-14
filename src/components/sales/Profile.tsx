import { Eye, EyeOff, Mail, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchDistributorProfile } from '../../api/portalApi'
import { changeOwnPassword } from '../../api/usersApi'
import { useAuth } from '../../context/AuthContext'
import { ApiError } from '../../types/auth'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function strengthMeta(pwd: string): { score: number; label: string; color: string } {
  if (!pwd) return { score: 0, label: '', color: '' }
  let s = 0
  if (pwd.length >= 8) s++
  if (/[A-Z]/.test(pwd)) s++
  if (/[0-9]/.test(pwd)) s++
  if (/[^A-Za-z0-9]/.test(pwd)) s++
  if (s <= 1) return { score: s, label: 'Weak', color: '#DC2626' }
  if (s === 2) return { score: s, label: 'Fair', color: '#F59E0B' }
  if (s === 3) return { score: s, label: 'Good', color: '#147BA6' }
  return { score: s, label: 'Strong', color: '#16A34A' }
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-[#C4C9D8] mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          autoComplete={label === 'Current Password' ? 'current-password' : 'new-password'}
          className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/10 transition"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-[#96A0B4]"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  )
}

export default function Profile() {
  const { user } = useAuth()
  const [distributorName, setDistributorName] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    fetchDistributorProfile()
      .then((p) => !cancelled && setDistributorName(p.company))
      .catch(() => !cancelled && setDistributorName(null))
    return () => {
      cancelled = true
    }
  }, [])

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const strength = strengthMeta(newPassword)
  const canSubmit = Boolean(currentPassword && newPassword && confirmPassword) && !saving

  async function handleSubmit() {
    setError(null)
    setSuccess(null)
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }
    setSaving(true)
    try {
      const detail = await changeOwnPassword(currentPassword, newPassword)
      setSuccess(detail)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-5 lg:p-7 space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Profile</h2>
        <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">Your account details and password</p>
      </div>

      {/* Identity Card */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
        <div className="h-16 bg-gradient-to-r from-[#7C3AED] to-[#5b21b6]" />
        <div className="px-5 pb-5 -mt-8">
          <div className="relative w-16 h-16 rounded-full bg-[#7C3AED] border-4 border-white dark:border-[#1A1D2E] flex items-center justify-center text-white text-xl font-bold">
            {initials(user?.name ?? '')}
            <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white dark:border-[#1A1D2E]" />
          </div>
          <div className="mt-3">
            <p className="text-base font-semibold text-gray-900 dark:text-[#E8EAF0]">{user?.name}</p>
            <p className="text-sm text-gray-500 dark:text-[#8892A4] flex items-center gap-1.5 mt-0.5">
              <Mail size={13} className="flex-shrink-0" /> {user?.email}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-[#252836]">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-[#C4C9D8] mb-1.5">Role</p>
              <span className="inline-flex text-xs font-semibold px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#7C3AED] dark:bg-[rgba(124,58,237,0.15)]">
                Sales Person
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-[#C4C9D8] mb-1.5">Linked Distributor</p>
              <p className="text-sm text-gray-900 dark:text-[#E8EAF0]">
                {distributorName === undefined ? 'Loading…' : (distributorName ?? '—')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} className="text-[#7C3AED]" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Change Password</h3>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 dark:bg-[rgba(220,38,38,0.1)] rounded-[8px] px-3 py-2 mb-4">
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-green-700 bg-green-50 dark:bg-[rgba(22,163,74,0.1)] dark:text-green-400 rounded-[8px] px-3 py-2 mb-4">
            {success}
          </p>
        )}

        <div className="space-y-4 max-w-sm">
          <PasswordField label="Current Password" value={currentPassword} onChange={setCurrentPassword} />
          <div>
            <PasswordField label="New Password" value={newPassword} onChange={setNewPassword} />
            {newPassword && (
              <div className="mt-1.5">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4].map((s) => (
                    <div
                      key={s}
                      className="flex-1 h-1.5 rounded-full transition-colors"
                      style={{ background: s <= strength.score ? strength.color : '#E5E7EB' }}
                    />
                  ))}
                </div>
                <p className="text-[11px]" style={{ color: strength.color }}>
                  {strength.label} — rough guide only, the real requirements are checked when you save
                </p>
              </div>
            )}
          </div>
          <PasswordField label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} />
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-5 py-2.5 text-sm font-semibold text-white rounded-[8px] hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition"
            style={{ background: '#7C3AED' }}
          >
            {saving ? 'Saving…' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  )
}
