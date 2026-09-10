export const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const

interface PageSizeSelectProps {
  value: number
  onChange: (size: number) => void
  label?: string
}

export default function PageSizeSelect({ value, onChange, label = 'Rows per page' }: PageSizeSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      title={label}
      className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
    >
      {PAGE_SIZE_OPTIONS.map((size) => (
        <option key={size} value={size}>
          {size} / page
        </option>
      ))}
    </select>
  )
}
