import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import AdminDashboard from './components/admin/AdminDashboard'
import AdminPortal from './components/admin/AdminPortal'
import Analytics from './components/admin/Analytics'
import Distributors from './components/admin/Distributors'
import Orders from './components/admin/Orders'
import ProductCatalogue from './components/admin/ProductCatalogue'
import Profile from './components/admin/Profile'
import Reports from './components/admin/Reports'
import SettingsScreen from './components/admin/Settings'
import UserManagement from './components/admin/UserManagement'
import Login from './components/auth/Login'
import DashboardPlaceholder from './components/DashboardPlaceholder'
import DistributorPortal from './components/distributor/DistributorPortal'
import Placeholder from './components/layout/Placeholder'
import { ADMIN_NAV_ITEMS, DISTRIBUTOR_NAV_ITEMS, screenTitle } from './config/navigation'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { ThemeProvider } from './context/ThemeContext'
import type { Role } from './types/auth'

const ROLE_PATHS: Record<Role, string> = {
  admin: '/admin',
  manager: '/manager',
  distributor: '/distributor',
  sales_person: '/sales',
}

function FullPageMessage({ text }: { text: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {text}
    </div>
  )
}

function RoleRoute({ role }: { role: Role }) {
  const { status, user } = useAuth()

  if (status === 'checking') return <FullPageMessage text="Loading…" />
  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={ROLE_PATHS[user.role]} replace />

  return <DashboardPlaceholder role={role} />
}

// Layout-route guard: gates an entire portal subtree on role, then hands off
// to the nested routes via Outlet (as opposed to RoleRoute, which renders a
// single placeholder screen directly).
function RoleGate({ role }: { role: Role }) {
  const { status, user } = useAuth()

  if (status === 'checking') return <FullPageMessage text="Loading…" />
  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={ROLE_PATHS[user.role]} replace />

  return <Outlet />
}

function LoginRoute() {
  const { status, user } = useAuth()

  if (status === 'checking') return <FullPageMessage text="Loading…" />
  if (status === 'authenticated' && user) return <Navigate to={ROLE_PATHS[user.role]} replace />

  return <Login />
}

function RootRedirect() {
  const { status, user } = useAuth()

  if (status === 'checking') return <FullPageMessage text="Loading…" />
  if (status === 'authenticated' && user) return <Navigate to={ROLE_PATHS[user.role]} replace />

  return <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />

      <Route path="/admin" element={<RoleGate role="admin" />}>
        <Route element={<AdminPortal />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          {ADMIN_NAV_ITEMS.map((item) => (
            <Route
              key={item.screen}
              path={item.path}
              element={
                item.screen === 'admin-dashboard' ? (
                  <AdminDashboard />
                ) : item.screen === 'product-catalogue' ? (
                  <ProductCatalogue />
                ) : item.screen === 'user-management' ? (
                  <UserManagement />
                ) : item.screen === 'distributors' ? (
                  <Distributors />
                ) : item.screen === 'orders' ? (
                  <Orders />
                ) : item.screen === 'reports' ? (
                  <Reports />
                ) : item.screen === 'analytics' ? (
                  <Analytics />
                ) : item.screen === 'settings' ? (
                  <SettingsScreen />
                ) : (
                  <Placeholder title={screenTitle[item.screen]} />
                )
              }
            />
          ))}
          {/* Not in ADMIN_NAV_ITEMS — no sidebar entry, only reachable via the header's profile dropdown */}
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
      </Route>

      <Route path="/distributor" element={<RoleGate role="distributor" />}>
        <Route element={<DistributorPortal />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          {DISTRIBUTOR_NAV_ITEMS.map((item) => (
            <Route key={item.screen} path={item.path} element={<Placeholder title={screenTitle[item.screen]} />} />
          ))}
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
      </Route>

      <Route path="/manager" element={<RoleRoute role="manager" />} />
      <Route path="/sales" element={<RoleRoute role="sales_person" />} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <CartProvider>
          <AppRoutes />
        </CartProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}

export default App
