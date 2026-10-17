import { getStoredToken } from '../context/AuthContext'
import { ApiError } from '../types/auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type OfferStatus = 'Active' | 'Scheduled' | 'Expired'

export interface OfferProduct {
  itemCode: string
  itemName: string
}

export interface Offer {
  id: number
  title: string
  description: string
  discountPercent: number
  startDate: string
  endDate: string
  appliesToAll: boolean
  productItemCodes: string[]
  products: OfferProduct[]
  status: OfferStatus
  createdAt: string
  updatedAt: string
}

export interface OfferPayload {
  title: string
  description: string
  discountPercent: number
  startDate: string
  endDate: string
  appliesToAll: boolean
  productItemCodes: string[]
}

interface OfferProductBody {
  item_code: string
  item_name: string
}

interface OfferBody {
  id: number
  title: string
  description: string
  discount_percent: number
  start_date: string
  end_date: string
  applies_to_all: boolean
  product_item_codes: string[]
  products: OfferProductBody[]
  status: OfferStatus
  created_at: string
  updated_at: string
}

function fromBody(b: OfferBody): Offer {
  return {
    id: b.id,
    title: b.title,
    description: b.description,
    discountPercent: b.discount_percent,
    startDate: b.start_date,
    endDate: b.end_date,
    appliesToAll: b.applies_to_all,
    productItemCodes: b.product_item_codes,
    products: b.products.map((p) => ({ itemCode: p.item_code, itemName: p.item_name })),
    status: b.status,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  }
}

function toBody(p: OfferPayload) {
  return {
    title: p.title,
    description: p.description,
    discount_percent: p.discountPercent,
    start_date: p.startDate,
    end_date: p.endDate,
    applies_to_all: p.appliesToAll,
    product_item_codes: p.appliesToAll ? [] : p.productItemCodes,
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

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export interface ActiveOffer {
  id: number
  title: string
  description: string
  discountPercent: number
  endDate: string
  appliesToAll: boolean
  productItemCodes: string[]
  products: OfferProduct[]
}

interface ActiveOfferBody {
  id: number
  title: string
  description: string
  discount_percent: number
  end_date: string
  applies_to_all: boolean
  product_item_codes: string[]
  products: OfferProductBody[]
}

/** GET /offers/active — currently-active offers, any authenticated role.
 * Consumed by the Distributor Dashboard's Exclusive Offers carousel. */
export async function fetchActiveOffers(): Promise<ActiveOffer[]> {
  const body = await request<ActiveOfferBody[]>('/offers/active')
  return body.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    discountPercent: b.discount_percent,
    endDate: b.end_date,
    appliesToAll: b.applies_to_all,
    productItemCodes: b.product_item_codes,
    products: b.products.map((p) => ({ itemCode: p.item_code, itemName: p.item_name })),
  }))
}

export async function listOffers(status?: OfferStatus): Promise<Offer[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  const body = await request<OfferBody[]>(`/offers${qs}`)
  return body.map(fromBody)
}

export async function createOffer(payload: OfferPayload): Promise<Offer> {
  return fromBody(await request<OfferBody>('/offers', { method: 'POST', body: JSON.stringify(toBody(payload)) }))
}

export async function updateOffer(id: number, payload: OfferPayload): Promise<Offer> {
  return fromBody(
    await request<OfferBody>(`/offers/${id}`, { method: 'PUT', body: JSON.stringify(toBody(payload)) }),
  )
}

export async function deleteOffer(id: number): Promise<void> {
  await request<{ detail: string }>(`/offers/${id}`, { method: 'DELETE' })
}
