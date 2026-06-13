import json
import logging
import os
from pathlib import Path
from cryptography.fernet import Fernet
from typing import List, Optional

from ..domain.models.auth import User, UserRole

logger = logging.getLogger(__name__)

class AuthRepository:
    """
    Stores users in an encrypted JSON file inside the vault.
    """

    def __init__(self, vault_dir: Path | str = "vault") -> None:
        self._dir = Path(vault_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._fernet = Fernet(self._resolve_key())
        self._file_path = self._dir / "users.json.enc"

    def _resolve_key(self) -> bytes:
        env_key = os.environ.get("VAULT_KEY")
        if env_key:
            return env_key.encode()

        key_file = self._dir / ".vault_key"
        if key_file.exists():
            return key_file.read_bytes()

        key = Fernet.generate_key()
        key_file.write_bytes(key)
        return key

    def _load_users(self) -> List[User]:
        if not self._file_path.exists():
            return []
        encrypted = self._file_path.read_bytes()
        try:
            plaintext = self._fernet.decrypt(encrypted).decode("utf-8")
            data = json.loads(plaintext)
            return [User(**u) for u in data]
        except Exception:
            return []

    def _save_users(self, users: List[User]) -> None:
        data = [u.model_dump() for u in users]
        plaintext = json.dumps(data).encode("utf-8")
        encrypted = self._fernet.encrypt(plaintext)
        self._file_path.write_bytes(encrypted)

    def get_user_by_email(self, email: str) -> Optional[User]:
        users = self._load_users()
        for u in users:
            if u.email == email:
                return u
        return None

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        users = self._load_users()
        for u in users:
            if u.id == user_id:
                return u
        return None

    def save_user(self, user: User) -> None:
        users = self._load_users()
        for i, u in enumerate(users):
            if u.id == user.id:
                users[i] = user
                self._save_users(users)
                return
        users.append(user)
        self._save_users(users)
