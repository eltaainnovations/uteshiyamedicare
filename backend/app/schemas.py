from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

Role = Literal["admin", "manager", "distributor", "sales_person"]
PortalUserStatus = Literal["draft", "active", "failed", "disabled"]
ReportType = Literal["sales", "orders", "top_products", "distributor_performance"]
Granularity = Literal["daily", "weekly", "monthly"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    remember_me: bool = False


class LoginChallengeResponse(BaseModel):
    challenge_id: str
    delivery: Literal["email"] = "email"
    masked_email: str
    expires_in_seconds: int
    dev_otp: str | None = None


class Verify2FARequest(BaseModel):
    challenge_id: str
    code: str = Field(min_length=4, max_length=8)


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Role


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in_seconds: int
    user: UserOut


class SessionResponse(BaseModel):
    user: UserOut
    expires_in_seconds: int


class MessageResponse(BaseModel):
    detail: str


class CreatePortalUserRequest(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1)
    last_name: str = ""
    portal_role: Role
    erpnext_customer_link: str | None = None

    @model_validator(mode="after")
    def _require_customer_link_for_field_roles(self) -> "CreatePortalUserRequest":
        if self.portal_role in ("distributor", "sales_person") and not self.erpnext_customer_link:
            raise ValueError("erpnext_customer_link is required for distributor and sales_person roles")
        return self


class PortalUserOut(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    portal_role: Role
    erpnext_customer_link: str | None
    status: PortalUserStatus
    failure_reason: str | None
    requested_by_email: str
    created_at: str
    updated_at: str


class ProductListItem(BaseModel):
    item_code: str
    item_name: str
    item_group: str
    has_variants: bool
    total_stock: int
    from_price: float | None


class ProductListResponse(BaseModel):
    items: list[ProductListItem]
    total: int
    page: int
    page_size: int
    categories: list[str]


class ProductAttributeOut(BaseModel):
    attribute: str
    value: str


class ProductVariantOut(BaseModel):
    item_code: str
    item_name: str
    stock: int
    price: float | None
    attributes: list[ProductAttributeOut]


class ProductSpec(BaseModel):
    key: str
    value: str


class ProductDetailOut(BaseModel):
    item_code: str
    item_name: str
    item_group: str
    description: str | None
    image: str | None
    has_variants: bool
    variants: list[ProductVariantOut]
    specifications: list[ProductSpec]


class DistributorListItem(BaseModel):
    name: str
    customer_name: str
    customer_group: str | None
    territory: str | None
    disabled: bool


class DistributorListResponse(BaseModel):
    items: list[DistributorListItem]
    total: int
    page: int
    page_size: int
    customer_groups: list[str]
    territories: list[str]


class DistributorAddressOut(BaseModel):
    name: str
    address_type: str | None
    address_line1: str | None
    address_line2: str | None
    city: str | None
    state: str | None
    country: str | None
    pincode: str | None
    is_primary_address: bool
    is_shipping_address: bool


class DistributorContactOut(BaseModel):
    name: str
    first_name: str | None
    last_name: str | None
    email_id: str | None
    phone: str | None
    mobile_no: str | None


class DistributorDetailOut(BaseModel):
    name: str
    customer_name: str
    customer_group: str | None
    territory: str | None
    customer_type: str | None
    disabled: bool
    addresses: list[DistributorAddressOut]
    contacts: list[DistributorContactOut]


class OrderListItem(BaseModel):
    name: str
    customer: str
    customer_name: str | None
    transaction_date: str | None
    delivery_date: str | None
    status: str
    item_count: int
    grand_total: float


class OrderListResponse(BaseModel):
    items: list[OrderListItem]
    total: int
    page: int
    page_size: int
    statuses: list[str]


class OrderItemOut(BaseModel):
    item_code: str
    item_name: str | None
    qty: float
    rate: float
    amount: float


class OrderSalesPersonOut(BaseModel):
    sales_person: str
    allocated_percentage: float


class OrderInvoiceOut(BaseModel):
    name: str
    status: str
    grand_total: float


class OrderDetailOut(BaseModel):
    name: str
    customer: str
    customer_name: str | None
    transaction_date: str | None
    delivery_date: str | None
    status: str
    items: list[OrderItemOut]
    sales_team: list[OrderSalesPersonOut]
    invoice: OrderInvoiceOut | None


class GenerateReportRequest(BaseModel):
    report_type: ReportType
    from_date: date
    to_date: date

    @model_validator(mode="after")
    def _date_order(self) -> "GenerateReportRequest":
        if self.to_date < self.from_date:
            raise ValueError("to_date must not be before from_date")
        return self


class AnalyticsRevenuePoint(BaseModel):
    bucket: str
    revenue: float
    order_count: int


class AnalyticsRevenueTrendOut(BaseModel):
    granularity: Granularity
    points: list[AnalyticsRevenuePoint]
    current_total: float
    previous_total: float
    change_pct: float | None


class AnalyticsDistributorItem(BaseModel):
    distributor: str
    customer: str | None
    order_count: int
    total_value: float
    revenue_share_pct: float


class AnalyticsDistributorPerformanceOut(BaseModel):
    items: list[AnalyticsDistributorItem]
    total_value: float


class AnalyticsProductItem(BaseModel):
    item_code: str
    item_name: str | None
    qty: float
    revenue: float


class AnalyticsTopProductsOut(BaseModel):
    items: list[AnalyticsProductItem]


class AnalyticsStatusCount(BaseModel):
    status: str
    count: int


class AnalyticsFulfillmentOut(BaseModel):
    totals: list[AnalyticsStatusCount]
    granularity: Granularity
    # Each point is {"bucket": str, <status>: int, <status>: int, ...} —
    # status keys are dynamic (whatever ERPNext's real statuses are), so
    # this can't be a fixed-field model without hardcoding that list.
    trend: list[dict[str, Any]]
    # Mean (delivery_date - transaction_date) in days, over orders in
    # range with both dates set; null if none do. "Planned" — not a real
    # delivery-completion timestamp, just the two dates ERPNext records.
    avg_lead_time_days: float | None


class AnalyticsCohortOut(BaseModel):
    new_count: int
    repeat_count: int


class CompanyProfileConfig(BaseModel):
    logo_url: str | None = None
    company_name: str = Field(min_length=1)
    legal_name: str = Field(min_length=1)
    industry: str | None = None
    year_incorporated: str | None = None
    registered_address: str = Field(min_length=1)
    city: str = Field(min_length=1)
    state: str = Field(min_length=1)
    pincode: str = Field(min_length=1, max_length=6)
    country: str = "India"
    billing_same_as_registered: bool = True
    phone: str = Field(min_length=1)
    support_email: EmailStr
    website: str | None = None
    customer_care: str | None = None


class BrandingConfig(BaseModel):
    primary_logo_url: str | None = None
    email_header_logo_url: str | None = None
    favicon_url: str | None = None
    email_footer_text: str | None = None
    email_accent_color: str = "#147BA6"


class LogoUploadOut(BaseModel):
    url: str


class ErpConnectionStatus(BaseModel):
    label: str
    masked_key: str
    connected: bool
    last_tested: str
    error: str | None = None


class ErpStatusResponse(BaseModel):
    connections: list[ErpConnectionStatus]


class SecurityConfig(BaseModel):
    min_password_length: int = Field(default=8, ge=4, le=64)
    # Stored but not actively enforced yet — enforcing it would mean
    # checking a password_changed_at timestamp at login time and forcing a
    # reset, which is a login-flow change beyond this settings page's
    # scope. Surfaced as "Not yet enforced" in the UI, same as
    # max_concurrent_sessions below.
    password_expiry_days: int = Field(default=90, ge=0)
    require_uppercase: bool = True
    require_number: bool = True
    require_special_char: bool = False
    prevent_reuse_count: int = Field(default=5, ge=0, le=24)
    session_timeout_minutes: int = Field(default=10, ge=1, le=1440)
    # Stored only — no session-store buildout to actually cap concurrent
    # sessions per user; surfaced as "Not yet enforced" in the UI.
    max_concurrent_sessions: int = Field(default=1, ge=1, le=20)
    max_failed_attempts: int = Field(default=5, ge=1, le=20)
    lockout_duration_minutes: int = Field(default=15, ge=1, le=1440)
    lockout_email_alert: bool = True


class ForceLogoutResult(BaseModel):
    token_version: int


class EmailConfig(BaseModel):
    smtp_host: str = ""
    smtp_port: int = 587
    encryption: Literal["SSL", "TLS"] = "TLS"
    smtp_username: str = ""
    # Never the real secret — true only if a password is currently stored.
    has_password: bool = False
    from_name: str = ""
    from_email: str = ""
    reply_to_email: str | None = None
    reply_to_name: str | None = None


class EmailConfigUpdate(BaseModel):
    smtp_host: str = ""
    smtp_port: int = 587
    encryption: Literal["SSL", "TLS"] = "TLS"
    smtp_username: str = ""
    # None = leave the currently stored password unchanged (write-only —
    # a save that doesn't include a new password must not wipe it).
    smtp_password: str | None = None
    from_name: str = ""
    from_email: str = ""
    reply_to_email: str | None = None
    reply_to_name: str | None = None


class TestEmailRequest(BaseModel):
    to: EmailStr


class TestEmailResult(BaseModel):
    success: bool
    detail: str


class NotificationRulesConfig(BaseModel):
    welcome_email: bool = True
    password_reset_email: bool = True
    account_status_change_email: bool = True


class PasswordResetRequest(BaseModel):
    email: EmailStr


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=1)
