import {
  AlertCircle, ArrowLeft, Bell, Building2, CheckCircle, ChevronRight, Eye, EyeOff, Info, Mail, Palette,
  RefreshCw, Shield, ToggleLeft, ToggleRight, Upload,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  fetchBranding, fetchCompanyProfile, fetchEmailConfig, fetchErpStatus, fetchNotificationRules,
  fetchSecurityConfig, forceLogoutAllUsers, saveBranding, saveCompanyProfile, saveEmailConfig,
  saveNotificationRules, saveSecurityConfig, sendTestEmail, testErpConnection, uploadLogo,
  type BrandingConfig, type CompanyProfile as CompanyProfileType, type EmailConfig as EmailConfigType,
  type ErpConnectionStatus, type NotificationRulesConfig as NotificationRulesConfigType,
  type SecurityConfig as SecurityConfigType,
} from '../../api/settingsApi'
import { ApiError } from '../../types/auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// — Types —————————————————————————————————————————————————————————————————

type SettingPage =
  | null
  | 'company'
  | 'branding'
  | 'email'
  | 'security'
  | 'erp'
  | 'notifications'

// — Tile definitions —————————————————————————————————————————————————————

const tiles: Array<{
  key: SettingPage
  icon: React.ElementType
  label: string
  desc: string
  color: string
  bg: string
  darkBg: string
}> = [
  { key: 'company',       icon: Building2,  label: 'Company Profile',      desc: 'Company name, address, and contact details',           color: '#147BA6', bg: '#e8f4fa',  darkBg: 'rgba(20,123,166,0.15)' },
  { key: 'branding',      icon: Palette,    label: 'Branding',             desc: 'Logo assets and email footer branding',                color: '#7C3AED', bg: '#F5F3FF',  darkBg: 'rgba(124,58,237,0.15)' },
  { key: 'email',         icon: Mail,       label: 'Email Configuration',  desc: 'SMTP settings that power real account email delivery', color: '#1F8A70', bg: '#e6f5f1',  darkBg: 'rgba(31,138,112,0.15)' },
  { key: 'security',      icon: Shield,     label: 'Security',             desc: 'Password policy, session timeout, login lockouts',      color: '#DC2626', bg: '#FEF2F2',  darkBg: 'rgba(220,38,38,0.15)' },
  { key: 'erp',           icon: RefreshCw,  label: 'ERP Integration',      desc: 'Live status of each ERPNext-scoped API key',           color: '#F59E0B', bg: '#FFFBEB',  darkBg: 'rgba(245,158,11,0.15)' },
  { key: 'notifications', icon: Bell,       label: 'Notification Rules',   desc: 'Toggle the account emails the Portal actually sends',  color: '#4AA3FF', bg: '#EFF6FF',  darkBg: 'rgba(74,163,255,0.15)' },
]

// — Shared sub-page shell —————————————————————————————————————————————————

function SubPage({
  title,
  subtitle,
  onBack,
  onSave,
  saving,
  saved,
  hideSave,
  children,
}: {
  title: string
  subtitle: string
  onBack: () => void
  onSave?: () => void
  saving?: boolean
  saved?: boolean
  hideSave?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="p-5 lg:p-7 space-y-5">
      {/* Breadcrumb */}
      <p className="text-xs text-gray-400 dark:text-[#5A6075]">
        <button onClick={onBack} className="hover:text-[#147BA6] transition">Settings</button>
        <span className="mx-1.5">›</span>
        <span className="text-gray-600 dark:text-[#96A0B4] font-medium">{title}</span>
      </p>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-gray-200 dark:border-[#252836] text-gray-500 dark:text-[#8892A4] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition"
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">{title}</h2>
            <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[10px] text-gray-600 dark:text-[#96A0B4] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition"
          >
            {hideSave ? 'Back' : 'Cancel'}
          </button>
          {!hideSave && (
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-[10px] transition hover:brightness-95 disabled:opacity-60"
              style={{ background: saved ? '#16A34A' : '#147BA6' }}
            >
              {saving ? 'Saving…' : saved ? <><CheckCircle size={14} /> Saved!</> : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {children}
    </div>
  )
}

// — Reusable form primitives ————————————————————————————————————————————

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-[#252836]">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">{title}</h3>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  )
}

function Field({ label, children, required }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-[#C4C9D8] mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2.5 text-sm border border-gray-200 rounded-[8px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition ${props.className ?? ''}`}
    />
  )
}

function Select({
  children,
  value,
  onChange,
}: {
  children: React.ReactNode
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full appearance-none pl-3 pr-8 py-2.5 text-sm border border-gray-200 rounded-[8px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition bg-white text-gray-700"
      >
        {children}
      </select>
      <ChevronRight size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075] pointer-events-none rotate-90" />
    </div>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>
}

function ColorPicker({ label, hex, onChange }: { label: string; hex: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 rounded-[8px] border border-gray-200 dark:border-[#252836] cursor-pointer p-0.5 bg-transparent"
      />
      <div className="flex-1">
        {label && <p className="text-xs font-medium text-gray-700 dark:text-[#C4C9D8]">{label}</p>}
        <input
          type="text"
          value={hex.toUpperCase()}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs font-mono text-gray-600 dark:text-[#96A0B4] bg-transparent outline-none w-24 border-b border-dashed border-gray-300 dark:border-[#252836] focus:border-[#147BA6] transition"
        />
      </div>
    </div>
  )
}

function ErrorNotice({ message }: { message: string }) {
  return <div className="text-xs text-red-600 bg-red-50 rounded-[8px] px-3 py-2.5">{message}</div>
}

function NotEnforcedNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-[8px] px-3 py-2">
      <Info size={13} className="text-amber-600 mt-0.5 flex-shrink-0" />
      <p className="text-xs text-amber-700">{children}</p>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-gray-800 dark:text-[#C4C9D8]">{label}</p>
        {hint && <p className="text-xs text-gray-400 dark:text-[#5A6075] mt-0.5">{hint}</p>}
      </div>
      <button onClick={() => onChange(!checked)} className="flex-shrink-0">
        {checked
          ? <ToggleRight size={30} style={{ color: '#147BA6' }} />
          : <ToggleLeft size={30} className="text-gray-300" />}
      </button>
    </div>
  )
}

// — 1. Company Profile ————————————————————————————————————————————————

const INDUSTRY_OPTIONS = ['Medical Devices', 'Pharmaceuticals', 'Healthcare Services']
const STATE_OPTIONS = ['Gujarat', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Telangana', 'Delhi', 'West Bengal']

function CompanyProfile({ onBack }: { onBack: () => void }) {
  const [profile, setProfile] = useState<CompanyProfileType | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchCompanyProfile()
      .then((p) => { if (!cancelled) setProfile(p) })
      .catch((err: unknown) => { if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load company profile.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function update<K extends keyof CompanyProfileType>(key: K, value: CompanyProfileType[K]) {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev))
    setSaved(false)
  }

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await saveCompanyProfile(profile)
      setProfile(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingLogo(true)
    setSaveError(null)
    try {
      const url = await uploadLogo(file)
      update('logoUrl', url)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not upload logo.')
    } finally {
      setUploadingLogo(false)
    }
  }

  if (loading || loadError || !profile) {
    return (
      <SubPage title="Company Profile" subtitle="Manage legal entity details used across invoices and portal branding" onBack={onBack} hideSave>
        {loadError ? <ErrorNotice message={loadError} /> : <p className="text-sm text-gray-500 dark:text-[#8892A4]">Loading…</p>}
      </SubPage>
    )
  }

  return (
    <SubPage
      title="Company Profile"
      subtitle="Manage legal entity details used across invoices and portal branding"
      onBack={onBack}
      onSave={handleSave}
      saving={saving}
      saved={saved}
    >
      {saveError && <ErrorNotice message={saveError} />}

      <Card title="Company Logo">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-[12px] border-2 border-dashed border-gray-200 dark:border-[#252836] bg-gray-50 dark:bg-[#161921] flex items-center justify-center text-gray-300 flex-shrink-0 overflow-hidden">
            {profile.logoUrl ? (
              <img src={`${API_URL}${profile.logoUrl}`} alt="Company logo" className="w-full h-full object-contain" />
            ) : (
              <Building2 size={28} />
            )}
          </div>
          <div>
            <label className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] text-gray-700 dark:text-[#C4C9D8] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition cursor-pointer w-fit">
              <Upload size={14} />
              {uploadingLogo ? 'Uploading…' : 'Upload Logo'}
              <input type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
            </label>
            <p className="text-xs text-gray-400 dark:text-[#5A6075] mt-2">PNG, JPG, or SVG · Max 2 MB · Recommended 200×60 px</p>
          </div>
        </div>
      </Card>

      <Card title="Basic Information">
        <Grid2>
          <Field label="Company Name" required>
            <Input value={profile.companyName} onChange={(e) => update('companyName', e.target.value)} />
          </Field>
          <Field label="Legal Name" required>
            <Input value={profile.legalName} onChange={(e) => update('legalName', e.target.value)} />
          </Field>
          <Field label="Industry">
            <Select value={profile.industry ?? ''} onChange={(e) => update('industry', e.target.value)}>
              {INDUSTRY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
            </Select>
          </Field>
          <Field label="Year of Incorporation">
            <Input value={profile.yearIncorporated ?? ''} onChange={(e) => update('yearIncorporated', e.target.value)} type="number" />
          </Field>
        </Grid2>
      </Card>

      <Card title="Address Details">
        <Field label="Registered Address" required>
          <Input value={profile.registeredAddress} onChange={(e) => update('registeredAddress', e.target.value)} />
        </Field>
        <Grid2>
          <Field label="City" required>
            <Input value={profile.city} onChange={(e) => update('city', e.target.value)} />
          </Field>
          <Field label="State" required>
            <Select value={profile.state} onChange={(e) => update('state', e.target.value)}>
              {STATE_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="PIN Code" required>
            <Input value={profile.pincode} onChange={(e) => update('pincode', e.target.value)} maxLength={6} />
          </Field>
          <Field label="Country">
            <Input value={profile.country} disabled className="bg-gray-50 text-gray-400" />
          </Field>
        </Grid2>
        <div className="pt-2 border-t border-gray-100 dark:border-[#252836]">
          <p className="text-xs font-semibold text-gray-700 dark:text-[#C4C9D8] mb-3">Billing Address</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={profile.billingSameAsRegistered}
              onChange={(e) => update('billingSameAsRegistered', e.target.checked)}
              className="accent-[#147BA6]"
            />
            <span className="text-sm text-gray-700 dark:text-[#C4C9D8]">Same as registered address</span>
          </label>
        </div>
      </Card>

      <Card title="Contact Details">
        <Grid2>
          <Field label="Phone Number" required>
            <Input value={profile.phone} onChange={(e) => update('phone', e.target.value)} type="tel" />
          </Field>
          <Field label="Support Email" required>
            <Input value={profile.supportEmail} onChange={(e) => update('supportEmail', e.target.value)} type="email" />
          </Field>
          <Field label="Website">
            <Input value={profile.website ?? ''} onChange={(e) => update('website', e.target.value)} type="url" />
          </Field>
          <Field label="Customer Care">
            <Input value={profile.customerCare ?? ''} onChange={(e) => update('customerCare', e.target.value)} />
          </Field>
        </Grid2>
      </Card>
    </SubPage>
  )
}

// — 2. Branding ——————————————————————————————————————————————————————

const LOGO_FIELDS: Array<{ key: 'primaryLogoUrl' | 'emailHeaderLogoUrl' | 'faviconUrl'; label: string; hint: string; h: string }> = [
  { key: 'primaryLogoUrl',     label: 'Primary Logo',      hint: 'Used in portal header, invoices · PNG/JPG/SVG, max 2 MB', h: 'h-14' },
  { key: 'emailHeaderLogoUrl', label: 'Email Header Logo', hint: 'Used in transactional email headers · Max 600×80 px',     h: 'h-10' },
  { key: 'faviconUrl',         label: 'Favicon',           hint: '32×32 px PNG/ICO',                                       h: 'h-8 w-8' },
]

function BrandingSettings({ onBack }: { onBack: () => void }) {
  const [branding, setBranding] = useState<BrandingConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchBranding()
      .then((b) => { if (!cancelled) setBranding(b) })
      .catch((err: unknown) => { if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load branding settings.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function update<K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) {
    setBranding((prev) => (prev ? { ...prev, [key]: value } : prev))
    setSaved(false)
  }

  async function handleSave() {
    if (!branding) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await saveBranding(branding)
      setBranding(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(key: (typeof LOGO_FIELDS)[number]['key'], file: File) {
    setUploadingKey(key)
    setSaveError(null)
    try {
      const url = await uploadLogo(file)
      update(key, url)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not upload file.')
    } finally {
      setUploadingKey(null)
    }
  }

  if (loading || loadError || !branding) {
    return (
      <SubPage title="Branding" subtitle="Control visual identity used across the portal and email communications" onBack={onBack} hideSave>
        {loadError ? <ErrorNotice message={loadError} /> : <p className="text-sm text-gray-500 dark:text-[#8892A4]">Loading…</p>}
      </SubPage>
    )
  }

  return (
    <SubPage
      title="Branding"
      subtitle="Control visual identity used across the portal and email communications"
      onBack={onBack}
      onSave={handleSave}
      saving={saving}
      saved={saved}
    >
      {saveError && <ErrorNotice message={saveError} />}

      {/* Live Preview removed — single-column layout, not the 3/5 + 2/5 split */}
      <div className="max-w-2xl space-y-5">
        <Card title="Logo Assets">
          <div className="space-y-4">
            {LOGO_FIELDS.map(({ key, label, hint, h }) => (
              <div key={key} className="flex items-center gap-4">
                <div className={`${h} w-28 rounded-[8px] border-2 border-dashed border-gray-200 dark:border-[#252836] bg-gray-50 dark:bg-[#161921] flex items-center justify-center flex-shrink-0 overflow-hidden`}>
                  {branding[key] ? (
                    <img src={`${API_URL}${branding[key]}`} alt={label} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-gray-300 dark:text-[#5A6075]">Preview</span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-700 dark:text-[#C4C9D8] mb-1">{label}</p>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-[#252836] rounded-[6px] text-gray-600 dark:text-[#96A0B4] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition cursor-pointer w-fit">
                    <Upload size={11} /> {uploadingKey === key ? 'Uploading…' : 'Upload'}
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.svg"
                      className="hidden"
                      disabled={uploadingKey !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (file) void handleUpload(key, file)
                      }}
                    />
                  </label>
                  <p className="text-[10px] text-gray-400 dark:text-[#5A6075] mt-1">{hint}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Email Branding">
          <Field label="Email Footer Text">
            <textarea
              value={branding.emailFooterText ?? ''}
              onChange={(e) => update('emailFooterText', e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-[8px] outline-none focus:border-[#147BA6] focus:ring-2 focus:ring-[#147BA6]/10 transition resize-none"
            />
          </Field>
          <Field label="Email Accent Color">
            <ColorPicker label="" hex={branding.emailAccentColor} onChange={(hex) => update('emailAccentColor', hex)} />
          </Field>
        </Card>
      </div>
    </SubPage>
  )
}

// — 3. ERP Integration (read-only status, no editable credentials/sync) —————

function ERPIntegration({ onBack }: { onBack: () => void }) {
  const [connections, setConnections] = useState<ErpConnectionStatus[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testingLabel, setTestingLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchErpStatus()
      .then((c) => { if (!cancelled) setConnections(c) })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load ERP connection status.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function handleTest(label: string) {
    setTestingLabel(label)
    setError(null)
    try {
      const updated = await testErpConnection(label)
      setConnections((prev) => (prev ? prev.map((c) => (c.label === label ? updated : c)) : prev))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not test this connection.')
    } finally {
      setTestingLabel(null)
    }
  }

  return (
    <SubPage
      title="ERP Integration"
      subtitle="Live status for each ERPNext-scoped API key — this portal reads ERPNext directly, so there's nothing to sync or schedule"
      onBack={onBack}
      hideSave
    >
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-[#8892A4]">Loading…</p>
      ) : error ? (
        <ErrorNotice message={error} />
      ) : !connections || connections.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-[#8892A4]">No ERPNext API keys are configured on the backend.</p>
      ) : (
        <div className="space-y-4">
          {connections.map((c) => (
            <div
              key={c.label}
              className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-5 flex flex-wrap items-center gap-5"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${c.connected ? 'bg-green-100' : 'bg-red-100'}`}>
                  {c.connected ? <CheckCircle size={20} className="text-green-600" /> : <AlertCircle size={20} className="text-red-600" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">{c.label}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {c.connected ? 'Connected' : 'Failed'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-[#5A6075] mt-0.5 font-mono">Key {c.maskedKey}</p>
                  <p className="text-xs text-gray-400 dark:text-[#5A6075] mt-0.5">
                    Last tested {new Date(c.lastTested).toLocaleString()}
                  </p>
                  {c.error && <p className="text-xs text-red-500 mt-0.5">{c.error}</p>}
                </div>
              </div>
              <button
                onClick={() => handleTest(c.label)}
                disabled={testingLabel === c.label}
                className="ml-auto px-4 py-2 text-xs font-semibold border border-gray-200 dark:border-[#252836] rounded-[8px] text-gray-700 dark:text-[#C4C9D8] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition disabled:opacity-60"
              >
                {testingLabel === c.label ? 'Testing…' : 'Test Connection'}
              </button>
            </div>
          ))}
        </div>
      )}
    </SubPage>
  )
}

// — 4. Security —————————————————————————————————————————————————————————

function SecuritySettings({ onBack }: { onBack: () => void }) {
  const [config, setConfig] = useState<SecurityConfigType | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [forceLogoutBusy, setForceLogoutBusy] = useState(false)
  const [forceLogoutMessage, setForceLogoutMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSecurityConfig()
      .then((c) => { if (!cancelled) setConfig(c) })
      .catch((err: unknown) => { if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load security settings.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function update<K extends keyof SecurityConfigType>(key: K, value: SecurityConfigType[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
    setSaved(false)
  }

  function numberField(onValue: (n: number) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => onValue(e.target.value === '' ? 0 : Number(e.target.value))
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await saveSecurityConfig(config)
      setConfig(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleForceLogout() {
    setForceLogoutBusy(true)
    setForceLogoutMessage(null)
    try {
      await forceLogoutAllUsers()
      setForceLogoutMessage('Done — every outstanding login token is now invalid. All users will need to log in again.')
    } catch (err) {
      setForceLogoutMessage(err instanceof ApiError ? err.message : 'Could not force logout right now.')
    } finally {
      setForceLogoutBusy(false)
    }
  }

  if (loading || loadError || !config) {
    return (
      <SubPage title="Security" subtitle="Manage authentication, password policy, and session behaviour" onBack={onBack} hideSave>
        {loadError ? <ErrorNotice message={loadError} /> : <p className="text-sm text-gray-500 dark:text-[#8892A4]">Loading…</p>}
      </SubPage>
    )
  }

  return (
    <SubPage
      title="Security"
      subtitle="Manage authentication, password policy, and session behaviour"
      onBack={onBack}
      onSave={handleSave}
      saving={saving}
      saved={saved}
    >
      {saveError && <ErrorNotice message={saveError} />}

      <Card title="Password Policy">
        <Grid2>
          <Field label="Minimum Password Length">
            <Input type="number" min={4} max={64} value={config.minPasswordLength} onChange={numberField((n) => update('minPasswordLength', n))} />
          </Field>
          <Field label="Password Expiry (days)">
            <Input type="number" min={0} value={config.passwordExpiryDays} onChange={numberField((n) => update('passwordExpiryDays', n))} />
          </Field>
        </Grid2>
        <NotEnforcedNotice>
          Expiry is stored but not enforced yet — there's no login-time check that forces a reset once a password ages past this many days.
        </NotEnforcedNotice>
        <div className="space-y-3 pt-1">
          <Toggle label="Require uppercase letter" checked={config.requireUppercase} onChange={(v) => update('requireUppercase', v)} />
          <Toggle label="Require at least one number" checked={config.requireNumber} onChange={(v) => update('requireNumber', v)} />
          <Toggle label="Require special character" checked={config.requireSpecialChar} onChange={(v) => update('requireSpecialChar', v)} />
        </div>
        <Field label="Prevent Reuse of Last N Passwords">
          <Input
            type="number"
            min={0}
            max={24}
            value={config.preventReuseCount}
            onChange={numberField((n) => update('preventReuseCount', n))}
            className="max-w-[140px]"
          />
        </Field>
        <p className="text-xs text-gray-400 dark:text-[#5A6075]">
          Enforced wherever a password is actually set — onboarding and password reset. Reuse is checked against a
          history kept locally, so it only catches passwords set through the Portal, not ones changed directly in ERPNext.
        </p>
      </Card>

      <Card title="Session Management">
        <Grid2>
          <Field label="Session Timeout (minutes)">
            <Input type="number" min={1} max={1440} value={config.sessionTimeoutMinutes} onChange={numberField((n) => update('sessionTimeoutMinutes', n))} />
          </Field>
          <Field label="Max Concurrent Sessions">
            <Input type="number" min={1} max={20} value={config.maxConcurrentSessions} onChange={numberField((n) => update('maxConcurrentSessions', n))} />
          </Field>
        </Grid2>
        <NotEnforcedNotice>
          Max Concurrent Sessions is not yet enforced — a user can still hold more simultaneous logins than this number.
        </NotEnforcedNotice>
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-[#252836]">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-[#C4C9D8]">Force Logout All Users</p>
            <p className="text-xs text-gray-400 dark:text-[#5A6075] mt-0.5">Invalidates every outstanding login token immediately, portal-wide</p>
          </div>
          <button
            onClick={handleForceLogout}
            disabled={forceLogoutBusy}
            className="px-4 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-[8px] hover:bg-red-50 transition disabled:opacity-60"
          >
            {forceLogoutBusy ? 'Logging out…' : 'Force Logout'}
          </button>
        </div>
        {forceLogoutMessage && <p className="text-xs text-gray-500 dark:text-[#8892A4]">{forceLogoutMessage}</p>}
      </Card>

      <Card title="Login Attempt Policy">
        <Grid2>
          <Field label="Max Failed Attempts">
            <Input type="number" min={1} max={20} value={config.maxFailedAttempts} onChange={numberField((n) => update('maxFailedAttempts', n))} />
          </Field>
          <Field label="Lockout Duration (minutes)">
            <Input type="number" min={1} max={1440} value={config.lockoutDurationMinutes} onChange={numberField((n) => update('lockoutDurationMinutes', n))} />
          </Field>
        </Grid2>
        <Toggle
          label="Send email alert on account lockout"
          hint="Notifies the locked-out user by email — requires SMTP set up in Email Configuration"
          checked={config.lockoutEmailAlert}
          onChange={(v) => update('lockoutEmailAlert', v)}
        />
      </Card>
    </SubPage>
  )
}

// — 5. Email Configuration ——————————————————————————————————————————————

const ENCRYPTION_OPTIONS = ['SSL', 'TLS'] as const

function EmailConfiguration({ onBack }: { onBack: () => void }) {
  const [config, setConfig] = useState<EmailConfigType | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; detail: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchEmailConfig()
      .then((c) => { if (!cancelled) setConfig(c) })
      .catch((err: unknown) => { if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load email configuration.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function update<K extends keyof EmailConfigType>(key: K, value: EmailConfigType[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
    setSaved(false)
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await saveEmailConfig({
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        encryption: config.encryption,
        smtpUsername: config.smtpUsername,
        smtpPassword: passwordInput.trim() ? passwordInput : undefined,
        fromName: config.fromName,
        fromEmail: config.fromEmail,
        replyToEmail: config.replyToEmail,
        replyToName: config.replyToName,
      })
      setConfig(updated)
      setPasswordInput('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestEmail() {
    if (!testTo.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await sendTestEmail(testTo.trim()))
    } catch (err) {
      setTestResult({ success: false, detail: err instanceof ApiError ? err.message : 'Could not send test email.' })
    } finally {
      setTesting(false)
    }
  }

  if (loading || loadError || !config) {
    return (
      <SubPage title="Email Configuration" subtitle="Configure SMTP credentials for transactional email delivery" onBack={onBack} hideSave>
        {loadError ? <ErrorNotice message={loadError} /> : <p className="text-sm text-gray-500 dark:text-[#8892A4]">Loading…</p>}
      </SubPage>
    )
  }

  return (
    <SubPage
      title="Email Configuration"
      subtitle="Configure SMTP credentials for transactional email delivery"
      onBack={onBack}
      onSave={handleSave}
      saving={saving}
      saved={saved}
    >
      {saveError && <ErrorNotice message={saveError} />}

      {!config.smtpHost && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-[10px] px-4 py-3">
          <Info size={16} className="text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            SMTP isn't configured yet — 2FA codes and account emails are logged server-side instead of sent, for local/dev testing.
          </p>
        </div>
      )}

      <Card title="SMTP Server">
        <Grid2>
          <Field label="SMTP Host" required>
            <Input value={config.smtpHost} onChange={(e) => update('smtpHost', e.target.value)} placeholder="smtp.gmail.com" />
          </Field>
          <Field label="Port" required>
            <Input
              type="number"
              value={config.smtpPort}
              onChange={(e) => update('smtpPort', e.target.value === '' ? 0 : Number(e.target.value))}
            />
          </Field>
        </Grid2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-[#C4C9D8]">Encryption</p>
            <p className="text-xs text-gray-400 dark:text-[#5A6075] mt-0.5">TLS recommended for port 587 · SSL for port 465</p>
          </div>
          <div className="flex gap-2">
            {ENCRYPTION_OPTIONS.map((enc) => (
              <button
                key={enc}
                onClick={() => update('encryption', enc)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-full border transition ${config.encryption === enc ? 'bg-[#147BA6] text-white border-[#147BA6]' : 'border-gray-200 dark:border-[#252836] text-gray-600 dark:text-[#96A0B4] hover:border-gray-300 dark:hover:border-[#252836]'}`}
              >
                {enc}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Authentication">
        <Field label="SMTP Username" required>
          <Input value={config.smtpUsername} onChange={(e) => update('smtpUsername', e.target.value)} type="email" />
        </Field>
        <Field label="SMTP Password" required={!config.hasPassword}>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder={config.hasPassword ? 'Stored — leave blank to keep it' : 'Enter SMTP password'}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075] hover:text-gray-600 dark:hover:text-[#96A0B4]"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-[#5A6075] mt-1">
            {config.hasPassword
              ? "A password is currently stored and is never shown here. Type a new one only to replace it."
              : 'Write-only — never returned once saved.'}
          </p>
        </Field>
      </Card>

      <Card title="Sender Identity">
        <Grid2>
          <Field label="From Name" required>
            <Input value={config.fromName} onChange={(e) => update('fromName', e.target.value)} />
          </Field>
          <Field label="From Email" required>
            <Input value={config.fromEmail} onChange={(e) => update('fromEmail', e.target.value)} type="email" />
          </Field>
          <Field label="Reply-To Email">
            <Input value={config.replyToEmail ?? ''} onChange={(e) => update('replyToEmail', e.target.value || null)} type="email" />
          </Field>
          <Field label="Reply-To Name">
            <Input value={config.replyToName ?? ''} onChange={(e) => update('replyToName', e.target.value || null)} />
          </Field>
        </Grid2>
      </Card>

      <Card title="Send Test Email">
        <div className="flex gap-3 items-end">
          <Field label="Test Recipient Email">
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="admin@uteshiya.com" type="email" />
          </Field>
          <button
            onClick={handleTestEmail}
            disabled={testing || !testTo.trim()}
            className="flex-shrink-0 px-4 py-2.5 text-sm font-semibold rounded-[8px] transition whitespace-nowrap disabled:opacity-60"
            style={{ background: testResult?.success ? '#16A34A' : '#147BA6', color: 'white' }}
          >
            {testing ? 'Sending…' : testResult?.success ? 'Sent!' : 'Send Test Email'}
          </button>
        </div>
        {testResult && (
          <div className={`flex items-center gap-2 mt-3 text-xs rounded-[8px] px-3 py-2 ${testResult.success ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
            {testResult.success ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
            {testResult.detail}
          </div>
        )}
      </Card>
    </SubPage>
  )
}

// — 6. Notification Rules (Account Notifications only) ————————————————————

function NotificationRules({ onBack }: { onBack: () => void }) {
  const [config, setConfig] = useState<NotificationRulesConfigType | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchNotificationRules()
      .then((c) => { if (!cancelled) setConfig(c) })
      .catch((err: unknown) => { if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load notification rules.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function update<K extends keyof NotificationRulesConfigType>(key: K, value: NotificationRulesConfigType[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
    setSaved(false)
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await saveNotificationRules(config)
      setConfig(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || loadError || !config) {
    return (
      <SubPage title="Notification Rules" subtitle="Control which automated account emails actually fire" onBack={onBack} hideSave>
        {loadError ? <ErrorNotice message={loadError} /> : <p className="text-sm text-gray-500 dark:text-[#8892A4]">Loading…</p>}
      </SubPage>
    )
  }

  return (
    <SubPage
      title="Notification Rules"
      subtitle="Control which automated account emails actually fire"
      onBack={onBack}
      onSave={handleSave}
      saving={saving}
      saved={saved}
    >
      {saveError && <ErrorNotice message={saveError} />}

      <div className="flex items-center gap-2 bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] border border-[#c7e2ef] rounded-[10px] px-4 py-3 text-xs text-[#0f5f82]">
        <Mail size={14} />
        <span>Only Account Notifications are wired up so far — Order, Inventory, and Invoice alerts have no trigger points in the Portal yet, so they aren't shown here.</span>
      </div>

      <Card title="Account Notifications">
        <div className="divide-y divide-gray-50 dark:divide-[#252836]">
          <div className="py-3 first:pt-0">
            <Toggle
              label="Welcome Email"
              hint="Sent to a new user when their account is approved and provisioned"
              checked={config.welcomeEmail}
              onChange={(v) => update('welcomeEmail', v)}
            />
          </div>
          <div className="py-3">
            <Toggle
              label="Password Reset"
              hint="Sent when a password reset is requested for an active account"
              checked={config.passwordResetEmail}
              onChange={(v) => update('passwordResetEmail', v)}
            />
          </div>
          <div className="py-3 last:pb-0">
            <Toggle
              label="Account Status Change"
              hint="Sent when an admin disables a user's account"
              checked={config.accountStatusChangeEmail}
              onChange={(v) => update('accountStatusChangeEmail', v)}
            />
          </div>
        </div>
      </Card>
    </SubPage>
  )
}

// — Root Settings component ——————————————————————————————————————————————

export default function SettingsScreen() {
  const [page, setPage] = useState<SettingPage>(null)

  if (page === 'company')       return <CompanyProfile     onBack={() => setPage(null)} />
  if (page === 'branding')      return <BrandingSettings   onBack={() => setPage(null)} />
  if (page === 'email')         return <EmailConfiguration onBack={() => setPage(null)} />
  if (page === 'security')      return <SecuritySettings   onBack={() => setPage(null)} />
  if (page === 'erp')           return <ERPIntegration     onBack={() => setPage(null)} />
  if (page === 'notifications') return <NotificationRules  onBack={() => setPage(null)} />

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Settings</h2>
        <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">System configuration and preferences</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {tiles.map(({ key, icon: Icon, label, desc, color, bg }) => (
          <button
            key={key}
            onClick={() => setPage(key)}
            className="group bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-5 text-left
              hover:border-[#147BA6] hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
          >
            <div className="flex items-start justify-between gap-3">
              <div
                className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                style={{ background: bg }}
              >
                <Icon size={20} style={{ color }} />
              </div>
              <ChevronRight
                size={16}
                className="text-gray-300 dark:text-[#5A6075] group-hover:text-[#147BA6] transition-colors mt-0.5 flex-shrink-0"
              />
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] group-hover:text-[#147BA6] transition-colors mt-4 leading-snug">
              {label}
            </p>
            <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-1 leading-relaxed">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
