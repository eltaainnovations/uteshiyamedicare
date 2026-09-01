import { getStoredToken } from '../context/AuthContext'
import { ApiError } from '../types/auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type ReportType = 'sales' | 'orders' | 'top_products' | 'distributor_performance'

/** Requests the report as a file, then hands it to the browser to save —
 * no "your report is ready" step, the download just starts. */
export async function generateReport(reportType: ReportType, fromDate: string, toDate: string): Promise<void> {
  const token = getStoredToken()
  let response: Response
  try {
    response = await fetch(`${API_URL}/reports/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ report_type: reportType, from_date: fromDate, to_date: toDate }),
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

  const blob = await response.blob()
  const filename = `${reportType}_${fromDate}_to_${toDate}.xlsx`

  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
