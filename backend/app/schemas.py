from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Role = Literal["admin", "manager", "distributor", "sales_person"]


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
