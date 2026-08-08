export interface Notification {
  id: number
  title: string
  desc: string
  time: string
  unread: boolean
}

// TODO(follow-up): replace with a real notifications feed.
const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 1, title: 'New order received', desc: 'ORD-2025-0891 from Apex Medicals', time: '2m ago', unread: true },
  {
    id: 2,
    title: 'Low stock alert',
    desc: 'Knee Implant System — 3 units left',
    time: '18m ago',
    unread: true,
  },
  { id: 3, title: 'ERP sync completed', desc: '847 records updated successfully', time: '1h ago', unread: false },
  {
    id: 4,
    title: 'Invoice overdue',
    desc: 'INV-2025-0442 — ₹1,24,000 pending',
    time: '3h ago',
    unread: false,
  },
]

export function useNotifications(): Notification[] {
  return MOCK_NOTIFICATIONS
}
