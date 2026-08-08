import { useAuth } from '../../context/AuthContext'
import { useAdminNavBadges } from '../../hooks/useNavBadges'
import { useAdminNavItems } from '../../hooks/useNavItems'
import Layout from '../layout/Layout'

export default function AdminPortal() {
  const navItems = useAdminNavItems()
  const badges = useAdminNavBadges()
  const { logout } = useAuth()

  return <Layout role="admin" navItems={navItems} badges={badges} basePath="/admin" onLogout={() => void logout()} />
}
