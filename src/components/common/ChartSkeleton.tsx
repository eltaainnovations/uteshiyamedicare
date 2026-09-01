export default function ChartSkeleton({ height = 220 }: { height?: number }) {
  return <div className="animate-pulse bg-gray-100 dark:bg-[#161921] rounded-[10px]" style={{ height }} />
}
