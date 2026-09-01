import { getStoredToken } from '../context/AuthContext'
import { ApiError } from '../types/auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface DistributorListItem {
  name: string
  customerName: string
  customerGroup: string | null
  territory: string | null
  disabled: boolean
}

export interface DistributorListPage {
  items: DistributorListItem[]
  total: number
  page: number
  pageSize: number
  customerGroups: string[]
  territories: string[]
}

export interface DistributorAddress {
  name: string
  addressType: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  country: string | null
  pincode: string | null
  isPrimaryAddress: boolean
  isShippingAddress: boolean
}

export interface DistributorContact {
  name: string
  firstName: string | null
  lastName: string | null
  emailId: string | null
  phone: string | null
  mobileNo: string | null
}

export interface DistributorDetail {
  name: string
  customerName: string
  customerGroup: string | null
  territory: string | null
  customerType: string | null
  disabled: boolean
  addresses: DistributorAddress[]
  contacts: DistributorContact[]
}

interface DistributorListItemBody {
  name: string
  customer_name: string
  customer_group: string | null
  territory: string | null
  disabled: boolean
}

interface DistributorListResponseBody {
  items: DistributorListItemBody[]
  total: number
  page: number
  page_size: number
  customer_groups: string[]
  territories: string[]
}

interface DistributorDetailBody {
  name: string
  customer_name: string
  customer_group: string | null
  territory: string | null
  customer_type: string | null
  disabled: boolean
  addresses: {
    name: string
    address_type: string | null
    address_line1: string | null
    address_line2: string | null
    city: string | null
    state: string | null
    country: string | null
    pincode: string | null
    is_primary_address: boolean
    is_shipping_address: boolean
  }[]
  contacts: {
    name: string
    first_name: string | null
    last_name: string | null
    email_id: string | null
    phone: string | null
    mobile_no: string | null
  }[]
}

async function request<T>(path: string): Promise<T> {
  const token = getStoredToken()
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
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

export async function fetchDistributors(
  params: {
    search?: string
    customerGroup?: string
    territory?: string
    page?: number
    pageSize?: number
  } = {},
): Promise<DistributorListPage> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.customerGroup) query.set('customer_group', params.customerGroup)
  if (params.territory) query.set('territory', params.territory)
  query.set('page', String(params.page ?? 1))
  query.set('page_size', String(params.pageSize ?? 20))

  const body = await request<DistributorListResponseBody>(`/distributors?${query.toString()}`)
  return {
    items: body.items.map((d) => ({
      name: d.name,
      customerName: d.customer_name,
      customerGroup: d.customer_group,
      territory: d.territory,
      disabled: d.disabled,
    })),
    total: body.total,
    page: body.page,
    pageSize: body.page_size,
    customerGroups: body.customer_groups,
    territories: body.territories,
  }
}

export async function fetchDistributorDetail(name: string): Promise<DistributorDetail> {
  const body = await request<DistributorDetailBody>(`/distributors/${encodeURIComponent(name)}`)
  return {
    name: body.name,
    customerName: body.customer_name,
    customerGroup: body.customer_group,
    territory: body.territory,
    customerType: body.customer_type,
    disabled: body.disabled,
    addresses: body.addresses.map((a) => ({
      name: a.name,
      addressType: a.address_type,
      addressLine1: a.address_line1,
      addressLine2: a.address_line2,
      city: a.city,
      state: a.state,
      country: a.country,
      pincode: a.pincode,
      isPrimaryAddress: a.is_primary_address,
      isShippingAddress: a.is_shipping_address,
    })),
    contacts: body.contacts.map((c) => ({
      name: c.name,
      firstName: c.first_name,
      lastName: c.last_name,
      emailId: c.email_id,
      phone: c.phone,
      mobileNo: c.mobile_no,
    })),
  }
}
