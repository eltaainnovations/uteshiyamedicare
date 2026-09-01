export default function ErrorBlock({ message, height = 220 }: { message: string; height?: number }) {
  return (
    <div className="flex items-center justify-center text-center text-sm text-red-600 px-4" style={{ height }}>
      {message}
    </div>
  )
}
