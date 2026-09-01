import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  UserCircle,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logoSrc from '@/assets/uteshiyamedicare.png'
import type { NavBadges } from '../../hooks/useNavBadges'
import { useNotifications } from '../../hooks/useNotifications'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import { useTheme } from '../../context/ThemeContext'
import type { NavItem, Screen } from '../../config/navigation'
import { screenTitle } from '../../config/navigation'
import CartDrawer from '../distributor/CartDrawer'

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface LayoutProps {
  role: 'admin' | 'distributor'
  navItems: NavItem[]
  badges?: NavBadges
  basePath: string
  onLogout: () => void
}

const PROFILE_MENU: { icon: LucideIcon; label: string; path: string }[] = [
  { icon: UserCircle, label: 'View Profile', path: 'profile' },
  { icon: Settings, label: 'Settings', path: 'settings' },
]

export default function Layout({ role, navItems, badges, basePath, onLogout }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { isDark, toggle: toggleTheme } = useTheme()
  const { count: cartCount, openCart } = useCart()
  const { user } = useAuth()
  const notifications = useNotifications()
  const location = useLocation()
  const navigate = useNavigate()

  const displayName = user?.name ?? (role === 'admin' ? 'Admin' : 'Distributor')
  const initials = initialsFromName(displayName)

  const activeItem = navItems.find((item) => location.pathname === `${basePath}/${item.path}`)
  const currentTitle: string = activeItem ? screenTitle[activeItem.screen as Screen] : ''

  const sidebar = (
    <aside
      className={`
        fixed lg:static inset-y-0 left-0 z-30 flex flex-col border-r border-gray-200
        transition-transform duration-300
        bg-white dark:bg-[#13161F] dark:border-[#252836]
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
      style={{ width: 260 }}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#252836]">
        <img
          src={logoSrc}
          alt="Uteshiya Medicare"
          className={`h-8 ${isDark ? 'brightness-0 invert opacity-90' : ''}`}
        />
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden text-gray-400 hover:text-gray-600 dark:text-[#5A6075] dark:hover:text-[#8892A4]"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-4 pt-4 pb-2">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{
            background:
              role === 'admin' ? (isDark ? 'rgba(20,123,166,0.18)' : '#e8f4fa') : isDark ? 'rgba(31,138,112,0.18)' : '#e6f5f1',
            color: role === 'admin' ? '#147BA6' : '#1F8A70',
          }}
        >
          {role === 'admin' ? 'Admin Portal' : 'Distributor Portal'}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navItems.map(({ icon: Icon, label, screen, path }) => {
          const badge = badges?.[screen]
          return (
            <NavLink
              key={screen}
              to={path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[8px] mb-0.5 text-left transition-all group
                ${
                  isActive
                    ? 'text-[#147BA6] font-semibold'
                    : 'text-gray-600 dark:text-[#8892A4] hover:bg-gray-50 dark:hover:bg-[#1F2233] hover:text-gray-900 dark:hover:text-[#E8EAF0]'
                }
              `}
              style={({ isActive }) => (isActive ? { background: isDark ? 'rgba(20,123,166,0.15)' : '#e8f4fa' } : undefined)}
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3">
                    <Icon
                      size={17}
                      className={
                        isActive
                          ? 'text-[#147BA6]'
                          : 'text-gray-400 dark:text-[#5A6075] group-hover:text-gray-600 dark:group-hover:text-[#8892A4]'
                      }
                    />
                    <span className="text-sm">{label}</span>
                  </div>
                  {Boolean(badge) && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#147BA6] text-white">
                      {badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-100 dark:border-[#252836]">
        <div className="flex items-center gap-3 px-3 py-2 rounded-[8px]">
          <div className="w-8 h-8 rounded-full bg-[#147BA6] text-white text-xs font-bold flex items-center justify-center">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0] truncate">{displayName}</p>
            <p className="text-[10px] text-gray-400 dark:text-[#5A6075] truncate">{user?.email ?? ''}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-sm text-red-500 hover:bg-red-50 dark:hover:bg-[rgba(220,38,38,0.1)] transition"
        >
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </aside>
  )

  const header = (
    <header className="flex items-center gap-4 px-4 lg:px-6 h-16 border-b border-gray-200 flex-shrink-0 sticky top-0 z-10 bg-white dark:bg-[#13161F] dark:border-[#252836]">
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden text-gray-500 hover:text-gray-700 dark:text-[#8892A4] dark:hover:text-[#E8EAF0]"
      >
        <Menu size={20} />
      </button>

      <div className="hidden lg:block text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">{currentTitle}</div>

      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
          <input
            type="text"
            placeholder="Search products, orders, distributors..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-[8px] outline-none focus:border-[#147BA6] transition
              bg-gray-50 dark:bg-[#161921] dark:border-[#252836] dark:text-[#E8EAF0] dark:placeholder-[#5A6075]
              focus:bg-white dark:focus:bg-[#1A1D2E]"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {role === 'admin' && (
          <button
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-[8px] transition hover:brightness-95"
            style={{ background: '#147BA6' }}
          >
            <Plus size={13} />
            Quick Create
          </button>
        )}

        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-9 h-9 flex items-center justify-center rounded-[8px] text-gray-500 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233] transition"
        >
          {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
        </button>

        <div className="relative">
          <button
            onClick={() => {
              setNotifOpen(!notifOpen)
              setProfileOpen(false)
            }}
            className="relative w-9 h-9 flex items-center justify-center rounded-[8px] text-gray-500 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233] transition"
          >
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-[#1A1D2E] rounded-[12px] shadow-xl border border-gray-100 dark:border-[#252836] z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-[#252836]">
                <span className="font-semibold text-sm text-gray-900 dark:text-[#E8EAF0]">Notifications</span>
                <span className="text-xs text-[#147BA6] cursor-pointer">Mark all read</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#1F2233] transition ${n.unread ? 'bg-blue-50/30 dark:bg-[rgba(20,123,166,0.05)]' : ''}`}
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.unread ? 'bg-[#147BA6]' : 'bg-transparent'}`} />
                    <div>
                      <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">{n.title}</p>
                      <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">{n.desc}</p>
                      <p className="text-[10px] text-gray-400 dark:text-[#5A6075] mt-1">{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-gray-100 dark:border-[#252836] text-center">
                <span className="text-xs text-[#147BA6] cursor-pointer">View all notifications</span>
              </div>
            </div>
          )}
        </div>

        <button className="w-9 h-9 flex items-center justify-center rounded-[8px] text-gray-500 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233] transition">
          <MessageSquare size={18} />
        </button>

        {role === 'distributor' && (
          <button
            onClick={openCart}
            className="relative w-9 h-9 flex items-center justify-center rounded-[8px] text-gray-500 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233] transition"
          >
            <ShoppingCart size={18} />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-[#147BA6] text-white flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => {
              setProfileOpen(!profileOpen)
              setNotifOpen(false)
            }}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-[8px] hover:bg-gray-100 dark:hover:bg-[#1F2233] transition"
          >
            <div className="w-7 h-7 rounded-full bg-[#147BA6] text-white text-xs font-bold flex items-center justify-center">
              {initials}
            </div>
            <span className="hidden md:block text-xs font-medium text-gray-700 dark:text-[#B0BAD0]">
              {displayName}
            </span>
            <ChevronDown size={13} className="text-gray-400 dark:text-[#5A6075]" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#1A1D2E] rounded-[12px] shadow-xl border border-gray-100 dark:border-[#252836] z-50 py-1">
              {PROFILE_MENU.map(({ icon: Icon, label, path }) => (
                <button
                  key={label}
                  onClick={() => {
                    setProfileOpen(false)
                    navigate(`${basePath}/${path}`)
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-gray-700 dark:text-[#B0BAD0] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition"
                >
                  <Icon size={14} className="text-gray-400 dark:text-[#5A6075]" />
                  {label}
                </button>
              ))}
              <div className="border-t border-gray-100 dark:border-[#252836] mt-1 pt-1">
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-[rgba(220,38,38,0.1)] transition"
                >
                  <LogOut size={14} />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )

  return (
    <div className="flex h-screen bg-[#F8FAFC] dark:bg-[#0F1117] overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {sidebar}

      <div className="flex-1 flex flex-col min-w-0">
        {header}
        <main className="flex-1 overflow-y-auto bg-[#F8FAFC] dark:bg-[#0F1117]">
          <Outlet />
        </main>
      </div>

      {role === 'distributor' && <CartDrawer />}
    </div>
  )
}
