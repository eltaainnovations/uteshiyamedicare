import { Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../../api/authApi'
import { ApiError } from '../../types/auth'
import AuthLayout from './AuthLayout'

interface FieldErrors {
  password?: string
  confirmPassword?: string
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors: FieldErrors = {}
    if (!password) errors.password = 'Password is required.'
    if (!confirmPassword) errors.confirmPassword = 'Confirm your new password.'
    else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.'

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0 || !token) return

    setError(null)
    setIsSubmitting(true)
    try {
      const message = await resetPassword(token, password)
      setSuccessMessage(message)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unexpected error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!token) {
    return (
      <AuthLayout>
        <div className="mb-2">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Invalid reset link</h2>
          <p className="text-sm text-gray-500">
            This password reset link is missing or malformed. Please request a new one.
          </p>
        </div>
        <Link
          to="/forgot-password"
          className="mt-6 block w-full text-center py-3 rounded-[10px] text-white text-sm font-semibold transition"
          style={{ background: 'linear-gradient(135deg, #147BA6, #0f5f82)' }}
        >
          Request a new link
        </Link>
      </AuthLayout>
    )
  }

  if (successMessage) {
    return (
      <AuthLayout>
        <div className="mb-2">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Password updated</h2>
          <p className="text-sm text-gray-500">{successMessage}</p>
        </div>
        <Link
          to="/login"
          className="mt-6 block w-full text-center py-3 rounded-[10px] text-white text-sm font-semibold transition"
          style={{ background: 'linear-gradient(135deg, #147BA6, #0f5f82)' }}
        >
          Back to login
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Set a new password</h2>
        <p className="text-sm text-gray-500">Choose a new password for your account.</p>
      </div>

      {error && (
        <p role="alert" className="mb-4 px-4 py-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </p>
      )}

      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
            New Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              disabled={isSubmitting}
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-[10px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {fieldErrors.password && (
            <p id="password-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">
            Confirm New Password
          </label>
          <input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="••••••••"
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
            disabled={isSubmitting}
            className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-[10px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition"
          />
          {fieldErrors.confirmPassword && (
            <p id="confirm-password-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-[10px] text-white text-sm font-semibold transition disabled:opacity-70"
          style={{ background: isSubmitting ? '#6B7280' : 'linear-gradient(135deg, #147BA6, #0f5f82)' }}
        >
          {isSubmitting ? 'Updating...' : 'Update password'}
        </button>
      </form>

      <Link to="/login" className="block mt-6 text-center text-sm text-gray-500 hover:text-gray-700">
        ← Back to login
      </Link>
    </AuthLayout>
  )
}
