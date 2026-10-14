import { useAuth } from '../../context/AuthContext'
import { useSalesPersonNavItems } from '../../hooks/useNavItems'
import Layout from '../layout/Layout'

export default function SalesPersonPortal() {
  const navItems = useSalesPersonNavItems()
  const { logout } = useAuth()

  return (
    <Layout role="sales_person" navItems={navItems} basePath="/sales" onLogout={() => void logout()} />
  )
}
