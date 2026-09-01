import { getStoredToken } from '../context/AuthContext'
import { ApiError } from '../types/auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface CompanyProfile {
  logoUrl: string | null
  companyName: string
  legalName: string
  industry: string | null
  yearIncorporated: string | null
  registeredAddress: string
  city: string
  state: string
  pincode: string
  country: string
  billingSameAsRegistered: boolean
  phone: string
  supportEmail: string
  website: string | null
  customerCare: string | null
}

export interface BrandingConfig {
  primaryLogoUrl: string | null
  emailHeaderLogoUrl: string | null
  faviconUrl: string | null
  emailFooterText: string | null
  emailAccentColor: string
}

export interface ErpConnectionStatus {
  label: string
  maskedKey: string
  connected: boolean
  lastTested: string
  error: string | null
}

export interface SecurityConfig {
  minPasswordLength: number
  passwordExpiryDays: number
  requireUppercase: boolean
  requireNumber: boolean
  requireSpecialChar: boolean
  preventReuseCount: number
  sessionTimeoutMinutes: number
  maxConcurrentSessions: number
  maxFailedAttempts: number
  lockoutDurationMinutes: number
  lockoutEmailAlert: boolean
}

export interface EmailConfig {
  smtpHost: string
  smtpPort: number
  encryption: 'SSL' | 'TLS'
  smtpUsername: string
  hasPassword: boolean
  fromName: string
  fromEmail: string
  replyToEmail: string | null
  replyToName: string | null
}

// PUT payload — smtpPassword is write-only: omit/undefined leaves the
// stored password unchanged, matching the backend's write-only field.
export interface EmailConfigDraft {
  smtpHost: string
  smtpPort: number
  encryption: 'SSL' | 'TLS'
  smtpUsername: string
  smtpPassword?: string
  fromName: string
  fromEmail: string
  replyToEmail: string | null
  replyToName: string | null
}

export interface NotificationRulesConfig {
  welcomeEmail: boolean
  passwordResetEmail: boolean
  accountStatusChangeEmail: boolean
}

interface CompanyProfileBody {
  logo_url: string | null
  company_name: string
  legal_name: string
  industry: string | null
  year_incorporated: string | null
  registered_address: string
  city: string
  state: string
  pincode: string
  country: string
  billing_same_as_registered: boolean
  phone: string
  support_email: string
  website: string | null
  customer_care: string | null
}

interface BrandingConfigBody {
  primary_logo_url: string | null
  email_header_logo_url: string | null
  favicon_url: string | null
  email_footer_text: string | null
  email_accent_color: string
}

interface ErpConnectionStatusBody {
  label: string
  masked_key: string
  connected: boolean
  last_tested: string
  error: string | null
}

interface SecurityConfigBody {
  min_password_length: number
  password_expiry_days: number
  require_uppercase: boolean
  require_number: boolean
  require_special_char: boolean
  prevent_reuse_count: number
  session_timeout_minutes: number
  max_concurrent_sessions: number
  max_failed_attempts: number
  lockout_duration_minutes: number
  lockout_email_alert: boolean
}

interface EmailConfigBody {
  smtp_host: string
  smtp_port: number
  encryption: 'SSL' | 'TLS'
  smtp_username: string
  has_password: boolean
  from_name: string
  from_email: string
  reply_to_email: string | null
  reply_to_name: string | null
}

interface EmailConfigDraftBody {
  smtp_host: string
  smtp_port: number
  encryption: 'SSL' | 'TLS'
  smtp_username: string
  smtp_password?: string | null
  from_name: string
  from_email: string
  reply_to_email: string | null
  reply_to_name: string | null
}

interface NotificationRulesConfigBody {
  welcome_email: boolean
  password_reset_email: boolean
  account_status_change_email: boolean
}

function fromCompanyProfileBody(body: CompanyProfileBody): CompanyProfile {
  return {
    logoUrl: body.logo_url,
    companyName: body.company_name,
    legalName: body.legal_name,
    industry: body.industry,
    yearIncorporated: body.year_incorporated,
    registeredAddress: body.registered_address,
    city: body.city,
    state: body.state,
    pincode: body.pincode,
    country: body.country,
    billingSameAsRegistered: body.billing_same_as_registered,
    phone: body.phone,
    supportEmail: body.support_email,
    website: body.website,
    customerCare: body.customer_care,
  }
}

function toCompanyProfileBody(profile: CompanyProfile): CompanyProfileBody {
  return {
    logo_url: profile.logoUrl,
    company_name: profile.companyName,
    legal_name: profile.legalName,
    industry: profile.industry,
    year_incorporated: profile.yearIncorporated,
    registered_address: profile.registeredAddress,
    city: profile.city,
    state: profile.state,
    pincode: profile.pincode,
    country: profile.country,
    billing_same_as_registered: profile.billingSameAsRegistered,
    phone: profile.phone,
    support_email: profile.supportEmail,
    website: profile.website,
    customer_care: profile.customerCare,
  }
}

function fromBrandingBody(body: BrandingConfigBody): BrandingConfig {
  return {
    primaryLogoUrl: body.primary_logo_url,
    emailHeaderLogoUrl: body.email_header_logo_url,
    faviconUrl: body.favicon_url,
    emailFooterText: body.email_footer_text,
    emailAccentColor: body.email_accent_color,
  }
}

function toBrandingBody(branding: BrandingConfig): BrandingConfigBody {
  return {
    primary_logo_url: branding.primaryLogoUrl,
    email_header_logo_url: branding.emailHeaderLogoUrl,
    favicon_url: branding.faviconUrl,
    email_footer_text: branding.emailFooterText,
    email_accent_color: branding.emailAccentColor,
  }
}

function fromErpStatusBody(body: ErpConnectionStatusBody): ErpConnectionStatus {
  return {
    label: body.label,
    maskedKey: body.masked_key,
    connected: body.connected,
    lastTested: body.last_tested,
    error: body.error,
  }
}

function fromSecurityConfigBody(body: SecurityConfigBody): SecurityConfig {
  return {
    minPasswordLength: body.min_password_length,
    passwordExpiryDays: body.password_expiry_days,
    requireUppercase: body.require_uppercase,
    requireNumber: body.require_number,
    requireSpecialChar: body.require_special_char,
    preventReuseCount: body.prevent_reuse_count,
    sessionTimeoutMinutes: body.session_timeout_minutes,
    maxConcurrentSessions: body.max_concurrent_sessions,
    maxFailedAttempts: body.max_failed_attempts,
    lockoutDurationMinutes: body.lockout_duration_minutes,
    lockoutEmailAlert: body.lockout_email_alert,
  }
}

function toSecurityConfigBody(config: SecurityConfig): SecurityConfigBody {
  return {
    min_password_length: config.minPasswordLength,
    password_expiry_days: config.passwordExpiryDays,
    require_uppercase: config.requireUppercase,
    require_number: config.requireNumber,
    require_special_char: config.requireSpecialChar,
    prevent_reuse_count: config.preventReuseCount,
    session_timeout_minutes: config.sessionTimeoutMinutes,
    max_concurrent_sessions: config.maxConcurrentSessions,
    max_failed_attempts: config.maxFailedAttempts,
    lockout_duration_minutes: config.lockoutDurationMinutes,
    lockout_email_alert: config.lockoutEmailAlert,
  }
}

function fromEmailConfigBody(body: EmailConfigBody): EmailConfig {
  return {
    smtpHost: body.smtp_host,
    smtpPort: body.smtp_port,
    encryption: body.encryption,
    smtpUsername: body.smtp_username,
    hasPassword: body.has_password,
    fromName: body.from_name,
    fromEmail: body.from_email,
    replyToEmail: body.reply_to_email,
    replyToName: body.reply_to_name,
  }
}

function toEmailConfigDraftBody(draft: EmailConfigDraft): EmailConfigDraftBody {
  return {
    smtp_host: draft.smtpHost,
    smtp_port: draft.smtpPort,
    encryption: draft.encryption,
    smtp_username: draft.smtpUsername,
    smtp_password: draft.smtpPassword,
    from_name: draft.fromName,
    from_email: draft.fromEmail,
    reply_to_email: draft.replyToEmail,
    reply_to_name: draft.replyToName,
  }
}

function fromNotificationRulesBody(body: NotificationRulesConfigBody): NotificationRulesConfig {
  return {
    welcomeEmail: body.welcome_email,
    passwordResetEmail: body.password_reset_email,
    accountStatusChangeEmail: body.account_status_change_email,
  }
}

function toNotificationRulesBody(config: NotificationRulesConfig): NotificationRulesConfigBody {
  return {
    welcome_email: config.welcomeEmail,
    password_reset_email: config.passwordResetEmail,
    account_status_change_email: config.accountStatusChangeEmail,
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken()
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  if (!response.ok) {
    let detail = 'Something went wrong. Please try again.'
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // response had no JSON body — keep the generic message
    }
    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as T
}

export async function fetchCompanyProfile(): Promise<CompanyProfile> {
  const body = await request<CompanyProfileBody>('/settings/company-profile')
  return fromCompanyProfileBody(body)
}

export async function saveCompanyProfile(profile: CompanyProfile): Promise<CompanyProfile> {
  const body = await request<CompanyProfileBody>('/settings/company-profile', {
    method: 'PUT',
    body: JSON.stringify(toCompanyProfileBody(profile)),
  })
  return fromCompanyProfileBody(body)
}

export async function fetchBranding(): Promise<BrandingConfig> {
  const body = await request<BrandingConfigBody>('/settings/branding')
  return fromBrandingBody(body)
}

export async function saveBranding(branding: BrandingConfig): Promise<BrandingConfig> {
  const body = await request<BrandingConfigBody>('/settings/branding', {
    method: 'PUT',
    body: JSON.stringify(toBrandingBody(branding)),
  })
  return fromBrandingBody(body)
}

export async function uploadLogo(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const body = await request<{ url: string }>('/settings/logo', { method: 'POST', body: formData })
  return body.url
}

export async function fetchErpStatus(): Promise<ErpConnectionStatus[]> {
  const body = await request<{ connections: ErpConnectionStatusBody[] }>('/settings/erp-status')
  return body.connections.map(fromErpStatusBody)
}

export async function testErpConnection(label: string): Promise<ErpConnectionStatus> {
  const body = await request<ErpConnectionStatusBody>(`/settings/erp-status/test/${encodeURIComponent(label)}`, {
    method: 'POST',
  })
  return fromErpStatusBody(body)
}

export async function fetchSecurityConfig(): Promise<SecurityConfig> {
  const body = await request<SecurityConfigBody>('/settings/security')
  return fromSecurityConfigBody(body)
}

export async function saveSecurityConfig(config: SecurityConfig): Promise<SecurityConfig> {
  const body = await request<SecurityConfigBody>('/settings/security', {
    method: 'PUT',
    body: JSON.stringify(toSecurityConfigBody(config)),
  })
  return fromSecurityConfigBody(body)
}

export async function forceLogoutAllUsers(): Promise<number> {
  const body = await request<{ token_version: number }>('/settings/security/force-logout', { method: 'POST' })
  return body.token_version
}

export async function fetchEmailConfig(): Promise<EmailConfig> {
  const body = await request<EmailConfigBody>('/settings/email-config')
  return fromEmailConfigBody(body)
}

export async function saveEmailConfig(draft: EmailConfigDraft): Promise<EmailConfig> {
  const body = await request<EmailConfigBody>('/settings/email-config', {
    method: 'PUT',
    body: JSON.stringify(toEmailConfigDraftBody(draft)),
  })
  return fromEmailConfigBody(body)
}

export async function sendTestEmail(to: string): Promise<{ success: boolean; detail: string }> {
  return request<{ success: boolean; detail: string }>('/settings/email-config/test', {
    method: 'POST',
    body: JSON.stringify({ to }),
  })
}

export async function fetchNotificationRules(): Promise<NotificationRulesConfig> {
  const body = await request<NotificationRulesConfigBody>('/settings/notification-rules')
  return fromNotificationRulesBody(body)
}

export async function saveNotificationRules(config: NotificationRulesConfig): Promise<NotificationRulesConfig> {
  const body = await request<NotificationRulesConfigBody>('/settings/notification-rules', {
    method: 'PUT',
    body: JSON.stringify(toNotificationRulesBody(config)),
  })
  return fromNotificationRulesBody(body)
}
