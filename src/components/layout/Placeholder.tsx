import { Construction } from 'lucide-react'

interface Props {
  title: string
  description?: string
}

export default function Placeholder({ title, description }: Props) {
  return (
    <div className="p-5 lg:p-7">
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 flex flex-col items-center justify-center text-center min-h-80">
        <div className="w-16 h-16 rounded-2xl bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] flex items-center justify-center mb-5">
          <Construction size={28} className="text-[#147BA6]" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-[#E8EAF0] mb-2">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-[#8892A4] max-w-sm">
          {description ?? 'This section is part of the full implementation. Navigate to other screens to explore the portal.'}
        </p>
      </div>
    </div>
  )
}
