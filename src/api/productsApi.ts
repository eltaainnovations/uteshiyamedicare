import { getStoredToken } from '../context/AuthContext'
import { ApiError } from '../types/auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface ProductListItem {
  itemCode: string
  itemName: string
  itemGroup: string
  hasVariants: boolean
  totalStock: number
  fromPrice: number | null
}

export interface ProductAttribute {
  attribute: string
  value: string
}

export interface ProductVariant {
  itemCode: string
  itemName: string
  stock: number
  price: number | null
  attributes: ProductAttribute[]
}

export interface ProductSpec {
  key: string
  value: string
}

export interface ProductListPage {
  items: ProductListItem[]
  total: number
  page: number
  pageSize: number
  categories: string[]
}

export interface ProductDetail {
  itemCode: string
  itemName: string
  itemGroup: string
  description: string | null
  image: string | null
  hasVariants: boolean
  variants: ProductVariant[]
  specifications: ProductSpec[]
}

interface ProductListItemBody {
  item_code: string
  item_name: string
  item_group: string
  has_variants: boolean
  total_stock: number
  from_price: number | null
}

interface ProductListResponseBody {
  items: ProductListItemBody[]
  total: number
  page: number
  page_size: number
  categories: string[]
}

interface ProductDetailBody {
  item_code: string
  item_name: string
  item_group: string
  description: string | null
  image: string | null
  has_variants: boolean
  variants: {
    item_code: string
    item_name: string
    stock: number
    price: number | null
    attributes: { attribute: string; value: string }[]
  }[]
  specifications: ProductSpec[]
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

export async function fetchProducts(
  params: { search?: string; category?: string; page?: number; pageSize?: number } = {},
): Promise<ProductListPage> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.category) query.set('category', params.category)
  query.set('page', String(params.page ?? 1))
  query.set('page_size', String(params.pageSize ?? 20))

  const body = await request<ProductListResponseBody>(`/products?${query.toString()}`)
  return {
    items: body.items.map((p) => ({
      itemCode: p.item_code,
      itemName: p.item_name,
      itemGroup: p.item_group,
      hasVariants: p.has_variants,
      totalStock: p.total_stock,
      fromPrice: p.from_price,
    })),
    total: body.total,
    page: body.page,
    pageSize: body.page_size,
    categories: body.categories,
  }
}

export async function fetchProductDetail(itemCode: string): Promise<ProductDetail> {
  const body = await request<ProductDetailBody>(`/products/${encodeURIComponent(itemCode)}`)
  return {
    itemCode: body.item_code,
    itemName: body.item_name,
    itemGroup: body.item_group,
    description: body.description,
    image: body.image,
    hasVariants: body.has_variants,
    variants: body.variants.map((v) => ({
      itemCode: v.item_code,
      itemName: v.item_name,
      stock: v.stock,
      price: v.price,
      attributes: v.attributes,
    })),
    specifications: body.specifications,
  }
}
