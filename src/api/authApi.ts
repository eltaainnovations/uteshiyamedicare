import { ApiError, type LoginChallenge, type Role, type User } from '../types/auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface LoginChallengeResponseBody {
  challenge_id: string
  masked_email: string
  expires_in_seconds: number
  dev_otp: string | null
}

interface TokenResponseBody {
  access_token: string
  expires_in_seconds: number
  user: { id: string; email: string; name: string; role: Role }
}

interface SessionResponseBody {
  user: { id: string; email: string; name: string; role: Role }
  expires_in_seconds: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  if (!response.ok) {
    let detail = 'Something went wrong. Please try again.'
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // response had no JSON body — keep the generic message
    }
    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as T
}

export async function login(email: string, password: string, rememberMe: boolean): Promise<LoginChallenge> {
  const body = await request<LoginChallengeResponseBody>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, remember_me: rememberMe }),
  })
  return {
    challengeId: body.challenge_id,
    maskedEmail: body.masked_email,
    expiresInSeconds: body.expires_in_seconds,
    devOtp: body.dev_otp,
  }
}

export async function verifyTwoFactor(
  challengeId: string,
  code: string,
): Promise<{ token: string; expiresInSeconds: number; user: User }> {
  const body = await request<TokenResponseBody>('/auth/verify-2fa', {
    method: 'POST',
    body: JSON.stringify({ challenge_id: challengeId, code }),
  })
  return { token: body.access_token, expiresInSeconds: body.expires_in_seconds, user: body.user }
}

export async function checkSession(token: string): Promise<{ user: User; expiresInSeconds: number }> {
  const body = await request<SessionResponseBody>('/auth/session', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return { user: body.user, expiresInSeconds: body.expires_in_seconds }
}

export async function logout(token: string): Promise<void> {
  await request<{ detail: string }>('/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}
