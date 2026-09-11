import { AlertTriangle, CheckCircle, Eye, EyeOff, Save, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { changeOwnPassword } from '../../api/usersApi'
import { fetchDistributorProfile } from '../../api/portalApi'
import { useAuth } from '../../context/AuthContext'
import { ApiError } from '../../types/auth'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
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
          className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition pr-10"
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

export default function DistProfile() {
  const { user } = useAuth()
  const [company, setCompany] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    fetchDistributorProfile()
      .then((p) => !cancelled && setCompany(p.company))
      .catch(() => !cancelled && setCompany(null))
    return () => {
      cancelled = true
    }
  }, [])

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = currentPassword && newPassword && confirmPassword && !saving

  async function handleSubmit() {
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }
    setSaving(true)
    try {
      await changeOwnPassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
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

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] p-5">
        <div className="flex items-center gap-5 pb-5 border-b border-gray-100 dark:border-[#252836]">
          <div className="w-16 h-16 rounded-full bg-[#147BA6] text-white text-xl font-bold flex items-center justify-center flex-shrink-0">
            {initials(user?.name ?? '')}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">{user?.name}</p>
            <p className="text-xs text-gray-500 dark:text-[#8892A4]">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5">
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-[#C4C9D8] mb-1.5">Role</p>
            <p className="text-sm text-gray-900 dark:text-[#E8EAF0]">Distributor</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-[#C4C9D8] mb-1.5">Company</p>
            <p className="text-sm text-gray-900 dark:text-[#E8EAF0]">
              {company === undefined ? 'Loading…' : (company ?? '—')}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} className="text-[#147BA6]" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Change Password</h3>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 dark:bg-[rgba(220,38,38,0.1)] rounded-[8px] px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <div className="space-y-4 max-w-sm">
          <PasswordField label="Current Password" value={currentPassword} onChange={setCurrentPassword} />
          <PasswordField label="New Password" value={newPassword} onChange={setNewPassword} />
          <PasswordField label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} />
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-[8px] text-white transition disabled:opacity-50 disabled:cursor-not-allowed ${saved ? 'bg-[#1F8A70]' : ''}`}
            style={saved ? undefined : { background: '#147BA6' }}
          >
            {saved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Update Password'}
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 px-4 py-3 rounded-[10px] bg-amber-50 dark:bg-[rgba(245,158,11,0.1)] border border-amber-200 dark:border-[rgba(245,158,11,0.25)]">
        <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Never share your password or OTP with anyone, including Uteshiya Medicare support staff. We will never ask
          for your credentials.
        </p>
      </div>
    </div>
  )
}
