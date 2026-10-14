import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../../api/authApi'
import { ApiError } from '../../types/auth'
import AuthLayout from './AuthLayout'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setEmailError('Email is required.')
      return
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError('Enter a valid email address.')
      return
    }

    setEmailError(undefined)
    setError(null)
    setIsSubmitting(true)
    try {
      const message = await requestPasswordReset(trimmedEmail)
      setSubmittedMessage(message)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unexpected error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submittedMessage) {
    return (
      <AuthLayout>
        <div className="mb-2">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Check your email</h2>
          <p className="text-sm text-gray-500">{submittedMessage}</p>
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
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Forgot your password?</h2>
        <p className="text-sm text-gray-500">Enter your email and we'll send you a link to reset it.</p>
      </div>

      {error && (
        <p role="alert" className="mb-4 px-4 py-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </p>
      )}

      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@uteshiya.com"
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? 'email-error' : undefined}
            disabled={isSubmitting}
            className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-[10px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition"
          />
          {emailError && (
            <p id="email-error" className="mt-1 text-xs text-red-600">
              {emailError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-[10px] text-white text-sm font-semibold transition disabled:opacity-70"
          style={{ background: isSubmitting ? '#6B7280' : 'linear-gradient(135deg, #147BA6, #0f5f82)' }}
        >
          {isSubmitting ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      <Link to="/login" className="block mt-6 text-center text-sm text-gray-500 hover:text-gray-700">
        ← Back to login
      </Link>
    </AuthLayout>
  )
}
