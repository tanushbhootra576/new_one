import os
import tempfile
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from ..domain.models.auth import SignupRequest, LoginRequest, AuthResponse, UserRole, User
from ..app.auth_service import AuthService
from ..adapters.auth_repository import AuthRepository

from fastapi.middleware.cors import CORSMiddleware
from mistralai import Mistral
from pydantic import BaseModel

from extractor import parse_audio_note, parse_document
from extractor.models import ClinicalNote, MedicalDocument

from ..adapters.mistral_planner import MistralPlanner
from ..adapters.mongo_vault import MongoEncryptedVault
from ..app.execution_service import ExecutionService
from ..app.followup_service import FollowupService
from ..app.notification_service import NotificationService
from ..app.plan_service import PlanService
from ..app.timeline_service import TimelineService

from ..domain.models.actions import Action, ActionPlan
from ..domain.models.execution import ActionDecision, ExecutionResult
from ..domain.models.timeline import TimelineDay
from ..domain.models.vault import ActionStatus, DoseStatus, MedicationSchedule, PatientCard, PatientHistory, Notification
from ..domain.models.coach import CoachContext, CoachSummary
from ..adapters.mistral_coach import MistralCoach

load_dotenv()


# --- Request schemas -------------------------------------------------------


class PlanRequest(BaseModel):
    documents: list[MedicalDocument]
    clinical_note: ClinicalNote | None = None


class ExecuteRequest(BaseModel):
    documents: list[MedicalDocument]
    clinical_note: ClinicalNote | None = None
    plan: ActionPlan
    decisions: list[ActionDecision] = []


class PendingActionsResponse(BaseModel):
    pending: list[Action]
    overdue: list[Action]


class MedicationsResponse(BaseModel):
    schedules: list[MedicationSchedule]
    adherence_score: int


class UploadResponse(BaseModel):
    documents: list[MedicalDocument]
    clinical_note: ClinicalNote | None
    upload_id: str


# --- Upload helpers --------------------------------------------------------


DOCUMENT_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".pdf"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac", ".mp4"}


def _suffix_for(upload: UploadFile) -> str:
    if upload.filename:
        return Path(upload.filename).suffix.lower()
    return ""


# --- Dependency wiring -----------------------------------------------------


_repository: MongoEncryptedVault | None = None
_plan_service: PlanService | None = None
_execution_service: ExecutionService | None = None
_followup_service: FollowupService | None = None
_notification_service: NotificationService | None = None


def _mistral_client() -> Mistral:
    return Mistral(api_key=os.environ["MISTRAL_API_KEY"])


def get_repository() -> MongoEncryptedVault:
    global _repository
    if _repository is None:
        _repository = MongoEncryptedVault()
    return _repository


def get_plan_service() -> PlanService:
    global _plan_service
    if _plan_service is None:
        _plan_service = PlanService(
            planner=MistralPlanner(_mistral_client()),
            repository=get_repository(),
        )
    return _plan_service


def get_execution_service() -> ExecutionService:
    global _execution_service
    if _execution_service is None:
        _execution_service = ExecutionService(repository=get_repository())
    return _execution_service


def get_followup_service() -> FollowupService:
    global _followup_service
    if _followup_service is None:
        _followup_service = FollowupService(repository=get_repository())
    return _followup_service


def get_notification_service() -> NotificationService:
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService(repository=get_repository())
    return _notification_service


_coach_service: MistralCoach | None = None


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


def get_coach_service() -> MistralCoach:
    global _coach_service
    if _coach_service is None:
        _coach_service = MistralCoach(_mistral_client())
    return _coach_service


# --- App -------------------------------------------------------------------


app = FastAPI(title="Arwen agent", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/upload", response_model=UploadResponse)
async def upload(
    patient_id: str = Depends(get_patient_id),
    files: list[UploadFile] = File(default=[]),
    audio: UploadFile | None = File(default=None),
) -> UploadResponse:
    """Parse uploaded medical documents and optional audio note.

    Accepts multipart/form-data with `files` (images/PDFs) and optional
    `audio`. Each file is written to a temp path, handed to the extractor,
    and the resulting Pydantic models are returned verbatim.
    """
    if not files and audio is None:
        raise HTTPException(status_code=400, detail="No files provided")

    documents: list[MedicalDocument] = []
    clinical_note: ClinicalNote | None = None

    with tempfile.TemporaryDirectory(prefix="aftermed_upload_") as tmpdir:
        tmp_path = Path(tmpdir)

        for upload_file in files:
            suffix = _suffix_for(upload_file)
            if suffix not in DOCUMENT_EXTENSIONS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported document extension: {suffix or upload_file.filename!r}",
                )
            dest = tmp_path / f"{uuid.uuid4().hex}{suffix}"
            dest.write_bytes(await upload_file.read())
            try:
                documents.append(parse_document(dest))
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to parse document {upload_file.filename!r}: {exc}",
                ) from exc

        if audio is not None:
            suffix = _suffix_for(audio) or ".mp3"
            if suffix not in AUDIO_EXTENSIONS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported audio extension: {suffix}",
                )
            dest = tmp_path / f"{uuid.uuid4().hex}{suffix}"
            dest.write_bytes(await audio.read())
            try:
                clinical_note = parse_audio_note(dest)
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to parse audio note: {exc}",
                ) from exc

    return UploadResponse(
        documents=documents,
        clinical_note=clinical_note,
        upload_id=uuid.uuid4().hex,
    )


@app.post("/api/plan", response_model=ActionPlan)
def plan(request: PlanRequest, patient_id: str = Depends(get_patient_id)) -> ActionPlan:
    service = get_plan_service()
    return service.plan_from_raw(
        request.documents,
        request.clinical_note,
        patient_id=patient_id,
    )


@app.post("/api/execute", response_model=ExecutionResult)
def execute(request: ExecuteRequest, patient_id: str = Depends(get_patient_id)) -> ExecutionResult:
    service = get_execution_service()
    return service.execute(
        patient_id=patient_id,
        documents=request.documents,
        clinical_note=request.clinical_note,
        plan=request.plan,
        decisions=request.decisions,
    )


@app.get("/api/patient/card", response_model=PatientCard)
def patient_card(patient_id: str = Depends(get_patient_id)) -> PatientCard:
    return get_repository().get_patient_card(patient_id)


@app.get("/api/patient/pending-actions", response_model=PendingActionsResponse)
def patient_pending_actions(patient_id: str = Depends(get_patient_id)) -> PendingActionsResponse:
    result = get_followup_service().pending_and_overdue(patient_id)
    return PendingActionsResponse(
        pending=result["pending"],
        overdue=result["overdue"],
    )


@app.get("/api/patient/history", response_model=PatientHistory)
def patient_history(patient_id: str = Depends(get_patient_id)) -> PatientHistory:
    return get_repository().get_history(patient_id)


@app.post("/api/patient/actions/{plan_id}/{action_id}/done")
def mark_action_done(plan_id: str, action_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:
    get_repository().update_action_status(
        patient_id=patient_id,
        plan_id=plan_id,
        action_id=action_id,
        status=ActionStatus.DONE,
    )
    return {"status": "ok"}


@app.get("/api/patient/medications", response_model=MedicationsResponse)
def patient_medications(patient_id: str = Depends(get_patient_id)) -> MedicationsResponse:
    schedules = get_repository().get_medication_schedules(patient_id)
    total_doses = sum(len(s.doses) for s in schedules)
    taken_doses = sum(
        sum(1 for d in s.doses if d.status == DoseStatus.TAKEN) for s in schedules
    )
    adherence_score = int((taken_doses / total_doses * 100)) if total_doses > 0 else 100
    return MedicationsResponse(schedules=schedules, adherence_score=adherence_score)


@app.post("/api/patient/medications/{schedule_id}/doses/{dose_id}/mark-taken")
def mark_dose_taken(schedule_id: str, dose_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:
    get_repository().update_dose_status(
        patient_id=patient_id,
        schedule_id=schedule_id,
        dose_id=dose_id,
        status=DoseStatus.TAKEN,
    )
    return {"status": "ok"}


@app.post("/api/patient/medications/{schedule_id}/doses/{dose_id}/skip")
def skip_dose(schedule_id: str, dose_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:
    get_repository().update_dose_status(
        patient_id=patient_id,
        schedule_id=schedule_id,
        dose_id=dose_id,
        status=DoseStatus.SKIPPED,
    )
    return {"status": "ok"}


@app.get("/api/patient/timeline", response_model=list[TimelineDay])
def get_timeline(patient_id: str = Depends(get_patient_id)) -> list[TimelineDay]:
    service = get_timeline_service()
    return service.get_patient_timeline(patient_id=patient_id)


@app.get("/api/patient/notifications", response_model=list[Notification])
def get_notifications(patient_id: str = Depends(get_patient_id)) -> list[Notification]:
    service = get_notification_service()
    return service.get_notifications(patient_id=patient_id)


@app.post("/api/patient/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:
    service = get_notification_service()
    service.mark_as_read(patient_id=patient_id, notification_id=notification_id)
    return {"status": "ok"}


@app.post("/api/coach", response_model=CoachSummary)
def generate_coach_summary(context: CoachContext, patient_id: str = Depends(get_patient_id)) -> CoachSummary:
    return get_coach_service().generate_summary(context)
