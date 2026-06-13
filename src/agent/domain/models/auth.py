from enum import Enum
from pydantic import BaseModel

class UserRole(str, Enum):
    PATIENT = "PATIENT"
    DOCTOR = "DOCTOR"

class User(BaseModel):
    id: str
    email: str
    password_hash: str
    role: UserRole
    name: str
    patient_id: str | None = None

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class AuthUserResponse(BaseModel):
    id: str
    email: str
    role: UserRole
    name: str
    patient_id: str | None = None

class AuthResponse(BaseModel):
    token: str
    user: AuthUserResponse
