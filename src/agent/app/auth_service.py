import hashlib
import os
import uuid
import jwt
from datetime import datetime, timedelta
from typing import Optional

from ..domain.models.auth import User, UserRole, AuthUserResponse
from ..adapters.auth_repository import AuthRepository

JWT_SECRET = os.environ.get("JWT_SECRET", "super-secret-key-for-hackathon-only")
JWT_ALGORITHM = "HS256"

class AuthService:
    def __init__(self, repository: AuthRepository) -> None:
        self._repository = repository
        self._ensure_doctor_exists()

    def _hash_password(self, password: str) -> str:
        # Simple hashing for MVP
        return hashlib.sha256(password.encode()).hexdigest()

    def _ensure_doctor_exists(self) -> None:
        doctor_email = "doctor"
        if not self._repository.get_user_by_email(doctor_email):
            doctor = User(
                id=uuid.uuid4().hex,
                email=doctor_email,
                password_hash=self._hash_password("doctor123"),
                role=UserRole.DOCTOR,
                name="Dr. Smith"
            )
            self._repository.save_user(doctor)

    def create_patient(self, email: str, password: str, name: str) -> User:
        if self._repository.get_user_by_email(email):
            raise ValueError("Email already in use")

        patient_id = "pat_" + uuid.uuid4().hex[:12]
        user = User(
            id=uuid.uuid4().hex,
            email=email,
            password_hash=self._hash_password(password),
            role=UserRole.PATIENT,
            name=name,
            patient_id=patient_id
        )
        self._repository.save_user(user)
        return user

    def authenticate(self, email: str, password: str) -> Optional[User]:
        user = self._repository.get_user_by_email(email)
        if not user:
            return None
        if user.password_hash != self._hash_password(password):
            return None
        return user

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        return self._repository.get_user_by_id(user_id)

    def create_token(self, user: User) -> str:
        payload = {
            "sub": user.id,
            "role": user.role.value,
            "patient_id": user.patient_id,
            "exp": datetime.utcnow() + timedelta(days=7)
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    def decode_token(self, token: str) -> dict:
        try:
            return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.PyJWTError:
            raise ValueError("Invalid token")

    def to_auth_response(self, user: User) -> AuthUserResponse:
        return AuthUserResponse(
            id=user.id,
            email=user.email,
            role=user.role,
            name=user.name,
            patient_id=user.patient_id
        )
