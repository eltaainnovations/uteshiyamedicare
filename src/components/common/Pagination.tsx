import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

/** Windowed page numbers with "…" gaps — e.g. [1, '…', 4, 5, 6, '…', 42]. */
function buildPageWindow(current: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1])
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b)

  const result: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…')
    result.push(sorted[i])
  }
  return result
}

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <span className="text-xs text-gray-500 dark:text-[#8892A4]">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="w-8 h-8 flex items-center justify-center rounded-[6px] text-gray-500 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition"
        >
          <ChevronLeft size={15} />
        </button>
        {buildPageWindow(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span
              key={`ellipsis-${i}`}
              className="w-8 h-8 flex items-center justify-center text-xs text-gray-400 dark:text-[#5A6075]"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 text-xs rounded-[6px] transition ${
                p === page
                  ? 'bg-[#147BA6] text-white'
                  : 'text-gray-600 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233]'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-[6px] text-gray-500 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
