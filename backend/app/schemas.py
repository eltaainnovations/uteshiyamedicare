from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

Role = Literal["admin", "manager", "distributor", "sales_person"]
PortalUserStatus = Literal["draft", "active", "failed", "disabled"]


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
