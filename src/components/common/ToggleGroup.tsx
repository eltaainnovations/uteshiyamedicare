export default function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[]
  value: T
  onChange: (v: T) => void
  labels?: Partial<Record<T, string>>
}) {
  return (
    <div className="flex gap-1 border border-gray-200 dark:border-[#252836] rounded-[8px] p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2.5 py-1.5 text-xs rounded-[6px] transition capitalize ${
            value === opt
              ? 'bg-[#147BA6] text-white'
              : 'text-gray-600 dark:text-[#8892A4] hover:bg-gray-50 dark:hover:bg-[#1F2233]'
          }`}
        >
          {labels?.[opt] ?? opt}
        </button>
      ))}
    </div>
  )
}
