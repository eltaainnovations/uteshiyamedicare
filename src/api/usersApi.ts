import { getStoredToken } from '../context/AuthContext'
import { ApiError, type Role } from '../types/auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type PortalUserStatus = 'draft' | 'active' | 'failed' | 'disabled'

export interface PortalUser {
  email: string
  firstName: string
  lastName: string
  portalRole: Role
  erpnextCustomerLink: string | null
  status: PortalUserStatus
  failureReason: string | null
  requestedByEmail: string
  createdAt: string
  updatedAt: string
}

export interface CreatePortalUserPayload {
  email: string
  firstName: string
  lastName: string
  portalRole: Role
  erpnextCustomerLink?: string
}

interface PortalUserBody {
  email: string
  first_name: string
  last_name: string
  portal_role: Role
  erpnext_customer_link: string | null
  status: PortalUserStatus
  failure_reason: string | null
  requested_by_email: string
  created_at: string
  updated_at: string
}

function fromBody(body: PortalUserBody): PortalUser {
  return {
    email: body.email,
    firstName: body.first_name,
    lastName: body.last_name,
    portalRole: body.portal_role,
    erpnextCustomerLink: body.erpnext_customer_link,
    status: body.status,
    failureReason: body.failure_reason,
    requestedByEmail: body.requested_by_email,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken()
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
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

export async function listPortalUsers(): Promise<PortalUser[]> {
  const body = await request<PortalUserBody[]>('/users')
  return body.map(fromBody)
}

export async function createPortalUser(payload: CreatePortalUserPayload): Promise<PortalUser> {
  const body = await request<PortalUserBody>('/users', {
    method: 'POST',
    body: JSON.stringify({
      email: payload.email,
      first_name: payload.firstName,
      last_name: payload.lastName,
      portal_role: payload.portalRole,
      erpnext_customer_link: payload.erpnextCustomerLink || null,
    }),
  })
  return fromBody(body)
}

export async function disablePortalUser(email: string): Promise<PortalUser> {
  const body = await request<PortalUserBody>(`/users/${encodeURIComponent(email)}/disable`, {
    method: 'POST',
  })
  return fromBody(body)
}
