import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import AuthLayout from './AuthLayout'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_LENGTH = 6

interface CredentialErrors {
  email?: string
  password?: string
}

export default function Login() {
  const {
    pendingChallenge,
    error,
    isSubmitting,
    sessionExpiredNotice,
    submitCredentials,
    submitTwoFactorCode,
    cancelTwoFactor,
  } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [credentialErrors, setCredentialErrors] = useState<CredentialErrors>({})

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''))

  function handleCredentialsSubmit(event: FormEvent) {
    event.preventDefault()
    const errors: CredentialErrors = {}
    const trimmedEmail = email.trim()
    if (!trimmedEmail) errors.email = 'Email is required.'
    else if (!EMAIL_REGEX.test(trimmedEmail)) errors.email = 'Enter a valid email address.'
    if (!password) errors.password = 'Password is required.'

    setCredentialErrors(errors)
    if (Object.keys(errors).length > 0) return
    void submitCredentials(trimmedEmail, password, rememberMe)
  }

  useEffect(() => {
    if (pendingChallenge) {
      document.getElementById('otp-0')?.focus()
    }
  }, [pendingChallenge])

  function handleOtpChange(index: number, rawValue: string) {
    const cleaned = rawValue.replace(/\D/g, '')
    if (!cleaned) {
      const next = [...otp]
      next[index] = ''
      setOtp(next)
      return
    }

    // If multiple digits entered (e.g. browser autofill or paste into field)
    if (cleaned.length > 1) {
      const next = [...otp]
      for (let i = 0; i < cleaned.length && index + i < OTP_LENGTH; i++) {
        next[index + i] = cleaned[i]
      }
      setOtp(next)
      const nextIndex = Math.min(index + cleaned.length, OTP_LENGTH - 1)
      document.getElementById(`otp-${nextIndex}`)?.focus()
      return
    }

    const next = [...otp]
    next[index] = cleaned
    setOtp(next)

    if (index < OTP_LENGTH - 1) {
      document.getElementById(`otp-${index + 1}`)?.focus()
    }
  }

  function handleOtpKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault()
      if (otp[index]) {
        // Clear current box if it has a digit
        const next = [...otp]
        next[index] = ''
        setOtp(next)
      } else if (index > 0) {
        // If current box is already empty, clear the previous box and move focus back
        const next = [...otp]
        next[index - 1] = ''
        setOtp(next)
        document.getElementById(`otp-${index - 1}`)?.focus()
      }
    } else if (event.key === 'Delete') {
      event.preventDefault()
      if (otp[index]) {
        const next = [...otp]
        next[index] = ''
        setOtp(next)
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      document.getElementById(`otp-${index - 1}`)?.focus()
    } else if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      event.preventDefault()
      document.getElementById(`otp-${index + 1}`)?.focus()
    } else if (event.key === 'Enter') {
      if (otp.join('').length === OTP_LENGTH && !isSubmitting) {
        event.preventDefault()
        handleOtpVerify()
      }
    }
  }

  function handleOtpPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const next = Array(OTP_LENGTH).fill('')
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i]
    }
    setOtp(next)
    const nextFocusIndex = Math.min(pasted.length, OTP_LENGTH - 1)
    document.getElementById(`otp-${nextFocusIndex}`)?.focus()
  }

  function handleClearOtp() {
    setOtp(Array(OTP_LENGTH).fill(''))
    document.getElementById('otp-0')?.focus()
  }

  function handleOtpVerify() {
    void submitTwoFactorCode(otp.join(''))
  }

  function handleBackToLogin() {
    setOtp(Array(OTP_LENGTH).fill(''))
    cancelTwoFactor()
  }

  return (
    <AuthLayout>
      {sessionExpiredNotice && pendingChallenge === null && (
        <p
          role="status"
          className="mb-4 px-4 py-3 rounded-[10px] bg-[#e8f4fa] border border-[#c7e2ef] text-[#0f5f82] text-sm"
        >
          You were signed out after 10 minutes of inactivity. Please log in again.
        </p>
      )}

      {error && (
        <p role="alert" className="mb-4 px-4 py-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </p>
      )}

      {pendingChallenge === null ? (
        <>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome</h2>
            <p className="text-sm text-gray-500">Sign in to your Uteshiya Medicare portal</p>
          </div>

          <form noValidate onSubmit={handleCredentialsSubmit} className="space-y-5">
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
                aria-invalid={Boolean(credentialErrors.email)}
                aria-describedby={credentialErrors.email ? 'email-error' : undefined}
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-[10px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition"
              />
              {credentialErrors.email && (
                <p id="email-error" className="mt-1 text-xs text-red-600">
                  {credentialErrors.email}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs text-[#147BA6] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  aria-invalid={Boolean(credentialErrors.password)}
                  aria-describedby={credentialErrors.password ? 'password-error' : undefined}
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
              {credentialErrors.password && (
                <p id="password-error" className="mt-1 text-xs text-red-600">
                  {credentialErrors.password}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 rounded border-gray-300 accent-[#147BA6]"
              />
              <label htmlFor="remember" className="text-sm text-gray-600">
                Remember me for 30 days
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-[10px] text-white text-sm font-semibold transition disabled:opacity-70"
              style={{ background: isSubmitting ? '#6B7280' : 'linear-gradient(135deg, #147BA6, #0f5f82)' }}
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="mb-8">
            <div className="w-14 h-14 rounded-2xl bg-[#e8f4fa] flex items-center justify-center mb-5">
              <ShieldCheck size={28} className="text-[#147BA6]" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Two-Factor Authentication</h2>
            <p className="text-sm text-gray-500">
              Enter the {OTP_LENGTH}-digit code sent to{' '}
              <span className="font-medium text-gray-700">{pendingChallenge.maskedEmail}</span>
            </p>
          </div>

          {pendingChallenge.devOtp && (
            <p className="mb-6 px-4 py-3 rounded-[10px] bg-amber-50 border border-amber-200 text-amber-700 text-sm">
              Dev mode: no email is actually sent yet. Your code is <strong>{pendingChallenge.devOtp}</strong>.
            </p>
          )}

          <div className="flex gap-2 mb-2">
            {otp.map((value, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={value}
                disabled={isSubmitting}
                onChange={(event) => handleOtpChange(index, event.target.value)}
                onKeyDown={(event) => handleOtpKeyDown(index, event)}
                onPaste={handleOtpPaste}
                onFocus={(event) => event.target.select()}
                className="flex-1 min-w-0 h-12 text-center text-lg font-bold border border-gray-300 rounded-[10px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition"
              />
            ))}
          </div>

          <div className="flex justify-end mb-6">
            <button
              type="button"
              onClick={handleClearOtp}
              disabled={isSubmitting || otp.every((v) => !v)}
              className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-0 transition font-medium"
            >
              Clear code
            </button>
          </div>

          <button
            onClick={handleOtpVerify}
            disabled={isSubmitting || otp.join('').length < OTP_LENGTH}
            className="w-full py-3 rounded-[10px] text-white text-sm font-semibold transition disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #147BA6, #0f5f82)' }}
          >
            {isSubmitting ? 'Verifying...' : 'Verify & Continue'}
          </button>

          <button
            type="button"
            onClick={handleBackToLogin}
            disabled={isSubmitting}
            className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to login
          </button>
        </>
      )}
    </AuthLayout>
  )
}
