export type Role = 'admin' | 'manager' | 'distributor' | 'sales_person'

export interface User {
  id: string
  email: string
  name: string
  role: Role
}

export interface LoginChallenge {
  challengeId: string
  maskedEmail: string
  expiresInSeconds: number
  /** Only present when the backend is running in demo mode (no SMTP wired up yet). */
  devOtp: string | null
}

export interface Session {
  user: User
  /** Access token expiry from time of issue/refresh, in seconds. */
  expiresInSeconds: number
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
