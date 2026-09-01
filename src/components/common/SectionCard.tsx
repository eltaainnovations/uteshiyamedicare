import type { ReactNode } from 'react'

export default function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-5 border border-gray-100 dark:border-[#252836] shadow-sm">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
