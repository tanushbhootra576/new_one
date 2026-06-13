import re

with open("src/agent/api/main.py", "r") as f:
    content = f.read()

# 1. Imports
imports = """
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from ..domain.models.auth import SignupRequest, LoginRequest, AuthResponse, UserRole, User
from ..app.auth_service import AuthService
from ..adapters.auth_repository import AuthRepository
"""

content = content.replace("from fastapi import FastAPI, File, HTTPException, UploadFile", "from fastapi import FastAPI, File, HTTPException, UploadFile" + imports)

# 2. Dependency wiring for Auth
auth_wiring = """
_auth_repository: AuthRepository | None = None
_auth_service: AuthService | None = None

def get_auth_service() -> AuthService:
    global _auth_repository, _auth_service
    if _auth_repository is None:
        _auth_repository = AuthRepository()
    if _auth_service is None:
        _auth_service = AuthService(_auth_repository)
    return _auth_service

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    try:
        service = get_auth_service()
        payload = service.decode_token(credentials.credentials)
        user = service.get_user_by_id(payload["sub"])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_patient_id(user: User = Depends(get_current_user), patient_id: str | None = None) -> str:
    if user.role == UserRole.PATIENT:
        return user.patient_id
    if user.role == UserRole.DOCTOR:
        if not patient_id:
            raise HTTPException(status_code=400, detail="patient_id required for doctors")
        return patient_id
    raise HTTPException(status_code=403, detail="Unknown role")
"""

content = content.replace("def get_coach_service() -> MistralCoach:", auth_wiring + "\n\ndef get_coach_service() -> MistralCoach:")

# 3. Auth endpoints
auth_endpoints = """
@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(request: SignupRequest) -> AuthResponse:
    service = get_auth_service()
    try:
        user = service.create_patient(request.email, request.password, request.name)
        token = service.create_token(user)
        return AuthResponse(token=token, user=service.to_auth_response(user))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/login", response_model=AuthResponse)
def login(request: LoginRequest) -> AuthResponse:
    service = get_auth_service()
    user = service.authenticate(request.email, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = service.create_token(user)
    return AuthResponse(token=token, user=service.to_auth_response(user))

@app.get("/api/auth/me")
def get_me(user: User = Depends(get_current_user)):
    service = get_auth_service()
    return service.to_auth_response(user)
"""

content = content.replace("@app.get(\"/api/health\")", auth_endpoints + "\n\n@app.get(\"/api/health\")")

# 4. Replace DEMO_PATIENT_ID with patient_id: str = Depends(get_patient_id)
# For `def upload(`
content = content.replace("def upload(", "def upload(\n    patient_id: str = Depends(get_patient_id),")

# For `def plan(request: PlanRequest) -> ActionPlan:`
content = content.replace("def plan(request: PlanRequest) -> ActionPlan:", "def plan(request: PlanRequest, patient_id: str = Depends(get_patient_id)) -> ActionPlan:")
content = content.replace("patient_id=DEMO_PATIENT_ID,", "patient_id=patient_id,")

# For `def execute(request: ExecuteRequest) -> ExecutionResult:`
content = content.replace("def execute(request: ExecuteRequest) -> ExecutionResult:", "def execute(request: ExecuteRequest, patient_id: str = Depends(get_patient_id)) -> ExecutionResult:")
# content.replace("patient_id=DEMO_PATIENT_ID," is already done above.

# For `def patient_card() -> PatientCard:`
content = content.replace("def patient_card() -> PatientCard:", "def patient_card(patient_id: str = Depends(get_patient_id)) -> PatientCard:")
content = content.replace("get_patient_card(DEMO_PATIENT_ID)", "get_patient_card(patient_id)")

# For `def patient_pending_actions() -> PendingActionsResponse:`
content = content.replace("def patient_pending_actions() -> PendingActionsResponse:", "def patient_pending_actions(patient_id: str = Depends(get_patient_id)) -> PendingActionsResponse:")
content = content.replace("pending_and_overdue(DEMO_PATIENT_ID)", "pending_and_overdue(patient_id)")

# For `def patient_history() -> PatientHistory:`
content = content.replace("def patient_history() -> PatientHistory:", "def patient_history(patient_id: str = Depends(get_patient_id)) -> PatientHistory:")
content = content.replace("get_history(DEMO_PATIENT_ID)", "get_history(patient_id)")

# For `def mark_action_done(plan_id: str, action_id: str) -> dict[str, str]:`
content = content.replace("def mark_action_done(plan_id: str, action_id: str) -> dict[str, str]:", "def mark_action_done(plan_id: str, action_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:")
# content.replace("patient_id=DEMO_PATIENT_ID," is already done above.

# For `def patient_medications() -> MedicationsResponse:`
content = content.replace("def patient_medications() -> MedicationsResponse:", "def patient_medications(patient_id: str = Depends(get_patient_id)) -> MedicationsResponse:")
content = content.replace("get_medication_schedules(DEMO_PATIENT_ID)", "get_medication_schedules(patient_id)")

# For `def mark_dose_taken(schedule_id: str, dose_id: str) -> dict[str, str]:`
content = content.replace("def mark_dose_taken(schedule_id: str, dose_id: str) -> dict[str, str]:", "def mark_dose_taken(schedule_id: str, dose_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:")

# For `def skip_dose(schedule_id: str, dose_id: str) -> dict[str, str]:`
content = content.replace("def skip_dose(schedule_id: str, dose_id: str) -> dict[str, str]:", "def skip_dose(schedule_id: str, dose_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:")

# For `def get_timeline() -> list[TimelineDay]:`
content = content.replace("def get_timeline() -> list[TimelineDay]:", "def get_timeline(patient_id: str = Depends(get_patient_id)) -> list[TimelineDay]:")

# For `def get_notifications() -> list[Notification]:`
content = content.replace("def get_notifications() -> list[Notification]:", "def get_notifications(patient_id: str = Depends(get_patient_id)) -> list[Notification]:")

# For `def mark_notification_read(notification_id: str) -> dict[str, str]:`
content = content.replace("def mark_notification_read(notification_id: str) -> dict[str, str]:", "def mark_notification_read(notification_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:")

# For `def generate_coach_summary(context: CoachContext) -> CoachSummary:`
content = content.replace("def generate_coach_summary(context: CoachContext) -> CoachSummary:", "def generate_coach_summary(context: CoachContext, patient_id: str = Depends(get_patient_id)) -> CoachSummary:")

with open("src/agent/api/main.py", "w") as f:
    f.write(content)
