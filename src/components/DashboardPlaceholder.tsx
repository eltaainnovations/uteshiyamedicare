import { useAuth } from '../context/AuthContext'
import type { Role } from '../types/auth'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  distributor: 'Distributor',
  sales_person: 'Sales Person',
}

export default function DashboardPlaceholder({ role }: { role: Role }) {
  const { user, logout } = useAuth()
  const label = ROLE_LABELS[role]

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>{label} Dashboard</h1>
      <p>This is a placeholder — the real {label} dashboard hasn't been built yet.</p>
      {user && (
        <p>
          Signed in as {user.name} ({user.email})
        </p>
      )}
      <button type="button" onClick={() => void logout()}>
        Log out
      </button>
    </div>
  )
}
