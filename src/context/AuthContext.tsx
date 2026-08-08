import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { checkSession, login as loginRequest, logout as logoutRequest, verifyTwoFactor } from '../api/authApi'
import { ApiError, type LoginChallenge, type User } from '../types/auth'

// Rolling inactivity window — must match backend/app/config.py session_timeout_minutes.
const SESSION_TIMEOUT_MS = 10 * 60 * 1000
// How often user activity is allowed to re-touch the server-side session,
// so we're not firing a request on every mousemove.
const ACTIVITY_PING_MIN_INTERVAL_MS = 60 * 1000
const TOKEN_STORAGE_KEY = 'um_token'

type AuthStatus = 'checking' | 'signed_out' | 'awaiting_2fa' | 'authenticated'

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  pendingChallenge: LoginChallenge | null
  error: string | null
  isSubmitting: boolean
  sessionExpiredNotice: boolean
  submitCredentials: (email: string, password: string, rememberMe: boolean) => Promise<void>
  submitTwoFactorCode: (code: string) => Promise<void>
  cancelTwoFactor: () => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? sessionStorage.getItem(TOKEN_STORAGE_KEY)
}

function storeToken(token: string, rememberMe: boolean): void {
  if (rememberMe) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } else {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
  }
}

function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  sessionStorage.removeItem(TOKEN_STORAGE_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [user, setUser] = useState<User | null>(null)
  const [pendingChallenge, setPendingChallenge] = useState<LoginChallenge | null>(null)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false)

  // Mirrors `user`/`status` in refs so the activity listeners (attached
  // once per authenticated session) always see the latest token/state
  // without having to re-bind on every render.
  const tokenRef = useRef<string | null>(null)
  const idleTimerRef = useRef<number | undefined>(undefined)
  const lastPingRef = useRef(0)

  const endSession = useCallback((notice: boolean) => {
    tokenRef.current = null
    clearStoredToken()
    setUser(null)
    setPendingChallenge(null)
    setStatus('signed_out')
    setSessionExpiredNotice(notice)
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
  }, [])

  const scheduleIdleLogout = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => {
      void logoutRequest(tokenRef.current ?? '').catch(() => {})
      endSession(true)
    }, SESSION_TIMEOUT_MS)
  }, [endSession])

  const registerActivity = useCallback(() => {
    scheduleIdleLogout()

    const now = Date.now()
    if (now - lastPingRef.current < ACTIVITY_PING_MIN_INTERVAL_MS) return
    lastPingRef.current = now

    const token = tokenRef.current
    if (!token) return
    checkSession(token).catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 401) endSession(true)
    })
  }, [scheduleIdleLogout, endSession])

  useEffect(() => {
    if (status !== 'authenticated') return
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((event) => window.addEventListener(event, registerActivity))
    scheduleIdleLogout()
    return () => {
      events.forEach((event) => window.removeEventListener(event, registerActivity))
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    }
  }, [status, registerActivity, scheduleIdleLogout])

  useEffect(() => {
    const existingToken = getStoredToken()
    if (!existingToken) {
      setStatus('signed_out')
      return
    }
    tokenRef.current = existingToken
    checkSession(existingToken)
      .then(({ user: sessionUser }) => {
        setUser(sessionUser)
        setStatus('authenticated')
      })
      .catch(() => {
        clearStoredToken()
        tokenRef.current = null
        setStatus('signed_out')
      })
  }, [])

  const submitCredentials = useCallback(async (email: string, password: string, remember: boolean) => {
    setError(null)
    setSessionExpiredNotice(false)
    setIsSubmitting(true)
    try {
      const challenge = await loginRequest(email, password, remember)
      setPendingChallenge(challenge)
      setRememberMe(remember)
      setStatus('awaiting_2fa')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unexpected error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const submitTwoFactorCode = useCallback(
    async (code: string) => {
      if (!pendingChallenge) return
      setError(null)
      setIsSubmitting(true)
      try {
        const { token, user: authedUser } = await verifyTwoFactor(pendingChallenge.challengeId, code)
        tokenRef.current = token
        storeToken(token, rememberMe)
        setUser(authedUser)
        setPendingChallenge(null)
        setStatus('authenticated')
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unexpected error. Please try again.')
      } finally {
        setIsSubmitting(false)
      }
    },
    [pendingChallenge, rememberMe],
  )

  const cancelTwoFactor = useCallback(() => {
    setPendingChallenge(null)
    setError(null)
    setStatus('signed_out')
  }, [])

  const logout = useCallback(async () => {
    const token = tokenRef.current
    if (token) {
      try {
        await logoutRequest(token)
      } catch {
        // best-effort revoke — clear local state regardless
      }
    }
    endSession(false)
  }, [endSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      pendingChallenge,
      error,
      isSubmitting,
      sessionExpiredNotice,
      submitCredentials,
      submitTwoFactorCode,
      cancelTwoFactor,
      logout,
    }),
    [
      status,
      user,
      pendingChallenge,
      error,
      isSubmitting,
      sessionExpiredNotice,
      submitCredentials,
      submitTwoFactorCode,
      cancelTwoFactor,
      logout,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
