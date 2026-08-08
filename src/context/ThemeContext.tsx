import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react'

interface ThemeContextValue {
  isDark: boolean
  toggle: () => void
}

interface ChartTheme {
  grid: string
  axis: string
  tooltip: CSSProperties
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const STORAGE_KEY = 'um_theme'

function getInitialIsDark(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(getInitialIsDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <ThemeContext.Provider value={{ isDark, toggle: () => setIsDark((prev) => !prev) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

export function useChartTheme(): ChartTheme {
  const { isDark } = useTheme()

  if (isDark) {
    return {
      grid: '#252836',
      axis: '#8892A4',
      tooltip: {
        backgroundColor: '#1A1D2E',
        border: '1px solid #252836',
        borderRadius: 8,
        fontSize: 12,
        color: '#E8EAF0',
      },
    }
  }

  return {
    grid: '#E5E7EB',
    axis: '#6B7280',
    tooltip: {
      backgroundColor: '#fff',
      border: '1px solid #E5E7EB',
      borderRadius: 8,
      fontSize: 12,
      color: '#111827',
    },
  }
}
