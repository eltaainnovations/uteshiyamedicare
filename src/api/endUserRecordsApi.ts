import { getStoredToken } from '../context/AuthContext'
import { ApiError } from '../types/auth'
import type { EndUserRecord, EndUserRecordStats } from './portalApi'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface EndUserDistributorOption {
  customerId: string
  customerName: string
}

export interface AdminEndUserRecordListResponse {
  items: EndUserRecord[]
  stats: EndUserRecordStats & { totalDistributors?: number }
  distributors: EndUserDistributorOption[]
}

interface EndUserRecordBody {
  id: number
  record_id: string
  customer_id?: string
  customer_name?: string
  item_code: string
  item_name: string
  quantity: number
  doctor_name: string
  hospital_name: string
  location: string
  batch_id: string
  implantation_date: string
  feedback_notes: string | null
  satisfaction_rating: number | null
  complication: boolean
  has_feedback: boolean
  created_at: string
}

interface AdminEndUserRecordListResponseBody {
  items: EndUserRecordBody[]
  stats: {
    total_records: number
    top_hospital: string | null
    top_hospital_count: number
    avg_satisfaction: number | null
    complication_alerts: number
    total_distributors?: number
  }
  distributors?: { customer_id: string; customer_name: string }[]
}

export async function fetchAdminEndUserRecords(params?: {
  search?: string
  customerId?: string
  rating?: string
}): Promise<AdminEndUserRecordListResponse> {
  const token = getStoredToken()
  const q = new URLSearchParams()
  if (params?.search) q.set('search', params.search.trim())
  if (params?.customerId && params.customerId !== 'all') q.set('customer_id', params.customerId)
  if (params?.rating && params.rating !== 'all') q.set('rating', params.rating)

  const queryStr = q.toString() ? `?${q.toString()}` : ''
  const res = await fetch(`${API_URL}/end-user-records${queryStr}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  if (!res.ok) {
    let errMessage = 'Could not load end user records.'
    try {
      const errBody = await res.json()
      if (errBody?.detail) errMessage = errBody.detail
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, errMessage)
  }

  const data: AdminEndUserRecordListResponseBody = await res.json()
  return {
    items: data.items.map((r) => ({
      id: r.id,
      recordId: r.record_id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      itemCode: r.item_code,
      itemName: r.item_name,
      quantity: r.quantity,
      doctorName: r.doctor_name,
      hospitalName: r.hospital_name,
      location: r.location,
      batchId: r.batch_id,
      implantationDate: r.implantation_date,
      feedbackNotes: r.feedback_notes,
      satisfactionRating: r.satisfaction_rating,
      complication: Boolean(r.complication),
      hasFeedback: Boolean(r.has_feedback),
      createdAt: r.created_at,
    })),
    stats: {
      totalRecords: data.stats.total_records,
      topHospital: data.stats.top_hospital,
      topHospitalCount: data.stats.top_hospital_count,
      avgSatisfaction: data.stats.avg_satisfaction,
      complicationAlerts: data.stats.complication_alerts,
      totalDistributors: data.stats.total_distributors,
    },
    distributors: (data.distributors ?? []).map((d) => ({
      customerId: d.customer_id,
      customerName: d.customer_name,
    })),
  }
}

