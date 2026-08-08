import { useState } from 'react'
import { useDistributorOptions } from '../../hooks/useDistributorOptions'

const ALL_VALUE = 'all'

interface Props {
  onChange?: (distributorId: string) => void
}

export default function DistributorFilterSelect({ onChange }: Props) {
  const distributors = useDistributorOptions()
  const [selected, setSelected] = useState(ALL_VALUE)

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value
    setSelected(value)
    onChange?.(value)
  }

  return (
    <select
      value={selected}
      onChange={handleChange}
      aria-label="Filter by distributor"
      className="px-4 py-2 text-sm border border-gray-200 rounded-[10px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition bg-white dark:bg-[#13161F] dark:border-[#252836] dark:text-[#E8EAF0]"
    >
      <option value={ALL_VALUE}>All Distributors</option>
      {distributors.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  )
}
