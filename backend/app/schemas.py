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


def _validate_customer_link(role: Role, link: str | None) -> None:
    """Shared by CreatePortalUserRequest and LinkExistingUserRequest so the
    rule can't drift between the two entry points."""
    if role in ("distributor", "sales_person") and not link:
        raise ValueError("erpnext_customer_link is required for distributor and sales_person roles")


class CreatePortalUserRequest(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1)
    last_name: str = ""
    portal_role: Role
    erpnext_customer_link: str | None = None

    @model_validator(mode="after")
    def _require_customer_link_for_field_roles(self) -> "CreatePortalUserRequest":
        _validate_customer_link(self.portal_role, self.erpnext_customer_link)
        return self


class LinkExistingUserRequest(BaseModel):
    """No first_name/last_name — the ERPNext user already exists, so
    users_service.link_existing_user pulls those from ERPNext instead of
    asking the admin to retype them."""

    email: EmailStr
    portal_role: Role
    erpnext_customer_link: str | None = None

    @model_validator(mode="after")
    def _require_customer_link_for_field_roles(self) -> "LinkExistingUserRequest":
        _validate_customer_link(self.portal_role, self.erpnext_customer_link)
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


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=1)


OfferStatus = Literal["Active", "Scheduled", "Expired"]


class OfferProductOut(BaseModel):
    item_code: str
    item_name: str


class OfferWrite(BaseModel):
    """Shared body for POST /offers and PUT /offers/{id}."""

    title: str = Field(min_length=1)
    description: str = ""
    discount_percent: float = Field(default=0, ge=0, le=100)
    start_date: date
    end_date: date
    applies_to_all: bool = False
    product_item_codes: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check(self) -> "OfferWrite":
        if self.end_date < self.start_date:
            raise ValueError("End date must be on or after the start date.")
        if self.applies_to_all and self.product_item_codes:
            raise ValueError("Clear the product list when the offer applies to all products.")
        if not self.applies_to_all and not self.product_item_codes:
            raise ValueError("Add at least one product, or turn on \"Applies to all products\".")
        return self


class OfferOut(BaseModel):
    id: int
    title: str
    description: str
    discount_percent: float
    start_date: date
    end_date: date
    applies_to_all: bool
    product_item_codes: list[str]
    products: list[OfferProductOut]
    status: OfferStatus  # computed from today's date, never stored
    created_at: str
    updated_at: str


class ActiveOfferOut(BaseModel):
    """Trimmed shape for the Distributor Portal — no status (all Active by
    definition) and no admin-only timestamps."""

    id: int
    title: str
    description: str
    discount_percent: float
    end_date: date
    applies_to_all: bool
    product_item_codes: list[str]
    products: list[OfferProductOut]


# --- Distributor Portal dashboard (routers/portal.py) ---------------------


class PortalWelcome(BaseModel):
    name: str  # the person (portal user's own name)
    company: str | None  # linked ERPNext Customer's display name
    customer_id: str


class PortalKpis(BaseModel):
    total_orders: int
    pending_orders: int
    pending_value: float
    completed_orders: int
    fulfillment_pct: float | None
    total_purchase_value: float
    outstanding_amount: float
    overdue_invoice_count: int
    outstanding_available: bool  # false = Sales Invoice read not yet permitted


class PortalTrendPoint(BaseModel):
    bucket: str  # "YYYY-MM"
    value: float
    orders: int


class PortalStatusSlice(BaseModel):
    status: str
    count: int


class PortalTopProduct(BaseModel):
    item_code: str
    item_name: str | None
    qty: float
    revenue: float


class PortalDashboardOut(BaseModel):
    welcome: PortalWelcome
    kpis: PortalKpis
    monthly_trend: list[PortalTrendPoint]
    order_status: list[PortalStatusSlice]
    top_products: list[PortalTopProduct]


class PortalOrderActionResponse(BaseModel):
    name: str
    docstatus: int
    detail: str


StockStatus = Literal["in_stock", "low_stock", "out_of_stock"]


class PortalProductListItem(BaseModel):
    item_code: str
    item_name: str
    item_group: str
    has_variants: bool
    image: str | None  # ERPNext Item.image; null on every item on this instance today
    total_stock: int  # sum of Bin.projected_qty across warehouses (variants rolled up)
    stock_status: StockStatus
    price: float | None  # customer-scoped rate, falling back to list_price
    list_price: float | None  # general price-list rate, for the struck-through MRP


class PortalProductListResponse(BaseModel):
    items: list[PortalProductListItem]
    total: int
    page: int
    page_size: int
    categories: list[str]


class PortalProductVariant(BaseModel):
    item_code: str
    item_name: str
    total_stock: int
    stock_status: StockStatus
    price: float | None
    list_price: float | None
    attributes: list[ProductAttributeOut]


class PortalProductVariantsOut(BaseModel):
    item_code: str
    item_name: str
    has_variants: bool
    image: str | None
    variants: list[PortalProductVariant]


class PortalInventoryItem(BaseModel):
    item_code: str
    item_name: str
    category: str | None  # ERPNext item_group
    unit: str | None  # ERPNext stock_uom
    quantity: int
    low_stock_threshold: int | None
    low_stock: bool  # threshold set and quantity <= threshold
    value: float | None  # quantity × this distributor's resolved price
    updated_at: str


class PortalInventoryResponse(BaseModel):
    items: list[PortalInventoryItem]


class PortalThresholdUpdate(BaseModel):
    # null clears the threshold (no reorder alert for this item)
    low_stock_threshold: int | None = Field(default=None, ge=0)


class EndUserRecordCreate(BaseModel):
    item_code: str = Field(min_length=1)
    quantity: int = Field(gt=0)
    doctor_name: str = Field(min_length=1)
    hospital_name: str = Field(min_length=1)
    location: str = Field(min_length=1)
    batch_id: str = Field(min_length=1)
    implantation_date: date
    # Optional at creation — post-op feedback is filled in later.
    feedback_notes: str | None = None
    satisfaction_rating: int | None = Field(default=None, ge=1, le=5)
    complication: bool = False


class EndUserRecordFeedbackUpdate(BaseModel):
    feedback_notes: str | None = None
    satisfaction_rating: int | None = Field(default=None, ge=1, le=5)
    complication: bool = False


class EndUserRecordOut(BaseModel):
    id: int
    record_id: str  # "EUR-0001"
    item_code: str
    item_name: str
    quantity: int
    doctor_name: str
    hospital_name: str
    location: str
    batch_id: str
    implantation_date: str
    feedback_notes: str | None
    satisfaction_rating: int | None
    complication: bool
    has_feedback: bool
    created_at: str


class EndUserRecordStats(BaseModel):
    total_records: int
    top_hospital: str | None
    top_hospital_count: int
    avg_satisfaction: float | None
    complication_alerts: int


class EndUserRecordListResponse(BaseModel):
    items: list[EndUserRecordOut]
    stats: EndUserRecordStats


class PortalCompletedOrderItem(BaseModel):
    name: str
    customer_name: str | None
    transaction_date: str | None
    delivery_date: str | None
    status: str  # "Completed" or "Closed"
    item_count: int
    grand_total: float
    item_names: list[str]  # "Item Name ×2" labels, for the multi-item summary + search


class PortalCompletedOrdersStats(BaseModel):
    total_completed: int  # Completed + Closed
    total_value: float
    avg_order_value: float


class PortalCompletedOrdersResponse(BaseModel):
    items: list[PortalCompletedOrderItem]
    stats: PortalCompletedOrdersStats


class PortalReorderLine(BaseModel):
    item_code: str
    item_name: str | None
    quantity: float
    price: float | None  # CURRENT customer-resolved catalogue price, not the historical rate


class PortalReorderResponse(BaseModel):
    order_name: str
    items: list[PortalReorderLine]


class TrackEvent(BaseModel):
    label: str
    description: str
    location: str
    timestamp: str  # raw string from Shree Maruti, exact format TBD from real data
    category: str  # "booking" | "traveling" | "delivery" | "" — drives timeline styling
    done: bool  # a later event exists
    current: bool  # the most recent event


class TrackShipmentOut(BaseModel):
    docket: str
    # "found"  -> success:"1", events present
    # "pending"-> success:"0" + "No tracking information found." (unknown docket
    #             OR a booking not yet CP-confirmed — we can't tell which)
    # "error"  -> success:"0" + any other message
    state: Literal["found", "pending", "error"]
    message: str | None
    latest: TrackEvent | None
    events: list[TrackEvent]
    pod_images: list[str]
    tracking_url: str  # public Shree Maruti tracking page for this docket
