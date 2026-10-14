import { ShieldCheck, Stethoscope, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import logoSrc from '@/assets/uteshiyamedicare.png'

const FEATURES = [
  { icon: ShieldCheck, text: 'HIPAA-compliant secure access' },
  { icon: Stethoscope, text: 'Real-time medical device tracking' },
  { icon: TrendingUp, text: 'Advanced analytics & reporting' },
]

const TAGS = ['Admin Portal', 'Distributor Portal', 'Analytics', 'ERP Sync']

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-[52%] relative overflow-hidden p-12"
        style={{ background: 'linear-gradient(145deg, #0d5f82 0%, #147BA6 45%, #1a9fd4 100%)' }}
      >
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>
        <div className="relative z-10">
          <img src={logoSrc} alt="Uteshiya Medicare" className="h-12 brightness-0 invert" />
        </div>
        <div className="relative z-10 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-200 mb-4">
            Enterprise Distributor Portal
          </p>
          <h1 className="text-4xl font-bold leading-tight mb-6">
            Empowering Healthcare
            <br />
            Distribution at Scale
          </h1>
          <p className="text-blue-100 text-lg leading-relaxed mb-12 max-w-md">
            Manage your complete medical device distribution network with real-time insights, seamless ordering,
            and end-to-end traceability.
          </p>
          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-white" />
                </div>
                <span className="text-blue-100 text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 flex gap-3">
          {TAGS.map((tag) => (
            <span key={tag} className="text-xs text-blue-200 border border-blue-400/30 rounded-full px-3 py-1">
              {tag}
            </span>
          ))}
        </div>
        <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/5" />
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex justify-center">
            <img src={logoSrc} alt="Uteshiya Medicare" className="h-10" />
          </div>

          {children}

          <p className="mt-8 text-xs text-center text-gray-400">
            © 2026 Uteshiya Medicare Pvt. Ltd. · All rights reserved
          </p>
        </div>
      </div>
    </div>
  )
}
