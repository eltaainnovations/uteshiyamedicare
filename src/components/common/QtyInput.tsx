import { useState } from 'react'

interface QtyInputProps {
  value: number
  onChange: (qty: number) => void
  className?: string
}

export default function QtyInput({ value, onChange, className = '' }: QtyInputProps) {
  // Only set while focused, so the box can sit empty mid-edit. Blank or 0
  // never reaches onChange: the box snaps back to `value` on blur, and a
  // cart line can't be deleted by clearing the field.
  const [draft, setDraft] = useState<string | null>(null)

  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, '')
    setDraft(digits)
    const parsed = Number(digits)
    if (parsed >= 1) onChange(parsed)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={6}
      aria-label="Quantity"
      value={draft ?? String(value)}
      onFocus={(e) => {
        setDraft(String(value))
        e.target.select()
      }}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className={`text-center font-bold bg-transparent outline-none text-gray-900 dark:text-[#E8EAF0] ${className}`}
    />
  )
}
