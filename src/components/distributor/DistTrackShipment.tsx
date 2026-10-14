import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  Package,
  Search,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { fetchTrackShipment, type TrackEvent, type TrackShipmentResult } from '../../api/portalApi'
import { ApiError } from '../../types/auth'

const CATEGORY_ICON: Record<string, LucideIcon> = {
  booking: Package,
  traveling: Truck,
  delivery: CheckCircle,
}

function EventIcon({ event }: { event: TrackEvent }) {
  const Icon = CATEGORY_ICON[event.category] ?? Clock
  const active = event.done || event.current
  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
        active ? 'bg-[#147BA6]' : 'bg-gray-100 dark:bg-[#252836]'
      }`}
    >
      <Icon size={event.current ? 18 : 16} className={active ? 'text-white' : 'text-gray-400 dark:text-[#5A6075]'} />
    </div>
  )
}

export default function DistTrackShipment() {
  const [docket, setDocket] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TrackShipmentResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch() {
    const trimmed = docket.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const r = await fetchTrackShipment(trimmed)
      setResult(r)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the tracking service.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Track Shipment</h2>
        <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
          Enter your Shree Maruti docket / AWB number to track your shipment
        </p>
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-5 border border-gray-100 dark:border-[#252836] shadow-sm">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
            <input
              value={docket}
              onChange={(e) => setDocket(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter docket / AWB number…"
              className="w-full pl-8 pr-4 py-2.5 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] dark:placeholder-[#5A6075] rounded-[8px] outline-none focus:border-[#147BA6] transition"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !docket.trim()}
            className="px-5 py-2.5 text-sm text-white font-medium rounded-[8px] transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#147BA6' }}
          >
            {loading ? 'Tracking…' : 'Track'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-[rgba(220,38,38,0.1)] border border-red-100 dark:border-red-900/30 rounded-[12px] p-5 text-center">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">Could not track this shipment</p>
          <p className="text-xs text-red-500 dark:text-red-400/80 mt-1">{error}</p>
        </div>
      )}

      {result?.state === 'error' && (
        <div className="bg-red-50 dark:bg-[rgba(220,38,38,0.1)] border border-red-100 dark:border-red-900/30 rounded-[12px] p-5 text-center">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">Docket not found</p>
          <p className="text-xs text-red-500 dark:text-red-400/80 mt-1">{result.message}</p>
        </div>
      )}

      {result?.state === 'pending' && (
        <div className="bg-gray-50 dark:bg-[#161921] border border-gray-200 dark:border-[#252836] rounded-[12px] p-5 text-center">
          <Clock size={20} className="text-gray-400 dark:text-[#5A6075] mx-auto mb-1.5" />
          <p className="text-sm font-semibold text-gray-700 dark:text-[#C4C9D8]">No tracking events yet</p>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-1">
            This shipment may not have been picked up yet — check back shortly, or confirm the docket number.
          </p>
        </div>
      )}

      {result?.state === 'found' && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-[#252836] flex flex-wrap gap-5 items-center">
            <div>
              <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">Docket</p>
              <p className="text-sm font-bold text-[#147BA6] font-mono">{result.docket}</p>
            </div>
            {result.latest && (
              <>
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">Current Status</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">{result.latest.label}</p>
                </div>
                {result.latest.location && (
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">Location</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">{result.latest.location}</p>
                  </div>
                )}
                {result.latest.timestamp && (
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">Last Updated</p>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                      {result.latest.timestamp}
                    </p>
                  </div>
                )}
              </>
            )}
            <a
              href={result.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-xs text-[#147BA6] border border-[#147BA6] px-3 py-1.5 rounded-full hover:bg-[#e8f4fa] dark:hover:bg-[rgba(20,123,166,0.15)] transition"
            >
              View on Shree Maruti <ExternalLink size={11} />
            </a>
          </div>

          <div className="p-6">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-[#C4C9D8] mb-5">
              Shipment Timeline ({result.events.length} event{result.events.length === 1 ? '' : 's'})
            </h4>
            {result.events.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#5A6075]">No events to show.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-[#252836]" />
                <div className="space-y-5">
                  {result.events.map((event, i) => (
                    <div key={i} className="flex items-start gap-5 relative">
                      <EventIcon event={event} />
                      <div className="pt-2 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className={`text-sm font-semibold ${
                              event.done || event.current
                                ? 'text-gray-900 dark:text-[#E8EAF0]'
                                : 'text-gray-400 dark:text-[#5A6075]'
                            }`}
                          >
                            {event.label || 'Update'}
                          </p>
                          {event.current && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] text-[#147BA6]">
                              Latest
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">{event.description}</p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-[#5A6075] mt-0.5">
                          {[event.location, event.timestamp].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {result.podImages.length > 0 && (
            <div className="px-6 pb-6">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-[#C4C9D8] mb-3 flex items-center gap-1.5">
                <CheckCircle size={14} className="text-green-600" /> Proof of Delivery
              </h4>
              <div className="flex flex-wrap gap-3">
                {result.podImages.map((src) => (
                  <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                    <img
                      src={src}
                      alt="Proof of delivery"
                      className="w-32 h-32 object-cover rounded-[8px] border border-gray-200 dark:border-[#252836]"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !error && !loading && (
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-[#5A6075] px-1">
          <AlertTriangle size={12} />
          Tracking is by docket / AWB number only — this isn't yet linked to your order history.
        </div>
      )}
    </div>
  )
}
