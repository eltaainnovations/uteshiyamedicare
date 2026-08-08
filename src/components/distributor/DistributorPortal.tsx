import { useAuth } from '../../context/AuthContext'
import { useDistributorNavBadges } from '../../hooks/useNavBadges'
import { useDistributorNavItems } from '../../hooks/useNavItems'
import Layout from '../layout/Layout'

export default function DistributorPortal() {
  const navItems = useDistributorNavItems()
  const badges = useDistributorNavBadges()
  const { logout } = useAuth()

  return (
    <Layout role="distributor" navItems={navItems} badges={badges} basePath="/distributor" onLogout={() => void logout()} />
  )
}
