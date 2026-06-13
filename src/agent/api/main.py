import os
import tempfile
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional, List

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ..domain.models.auth import SignupRequest, LoginRequest, AuthResponse, UserRole, User
from ..app.auth_service import AuthService
from ..adapters.auth_repository import AuthRepository

from ..adapters.mongo_db import ArwenDatabaseClient
from ..adapters.gemini_service import GeminiService, IngestExtraction, RecoveryPlanResponse, ExtractedMedication
from ..app.execution_service import ExecutionService
from ..app.followup_service import FollowupService
from ..app.notification_service import NotificationService
from ..app.plan_service import PlanService
from ..app.timeline_service import TimelineService

from ..domain.models.actions import Action, ActionPlan
from ..domain.models.execution import ActionDecision, ExecutionResult
from ..domain.models.timeline import TimelineDay
from ..domain.models.vault import ActionStatus, DoseStatus, MedicationSchedule, PatientCard, PatientHistory, Notification, PatientSearchResult
from ..domain.models.coach import CoachContext, CoachSummary
from ..adapters.mistral_coach import MistralCoach

# We still import these for UploadResponse structure compatibility with front-end
from extractor.models import ClinicalNote, MedicalDocument, DocumentType, Medication as ExtMedication

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

class IngestRequest(BaseModel):
    prescription: Optional[str] = None
    discharge_summary: Optional[str] = None
    clinical_notes: Optional[str] = None
    transcript: Optional[str] = None

class ReminderRequest(BaseModel):
    medication: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    reminder_times: List[str] = Field(default_factory=list)

class AppointmentRequest(BaseModel):
    title: str
    doctor_name: Optional[str] = None
    date: datetime
    description: Optional[str] = None

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    history: List[ChatMessage] = Field(default_factory=list)
    query: str

# --- Upload helpers --------------------------------------------------------

DOCUMENT_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".pdf"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac", ".mp4"}

def _suffix_for(upload: UploadFile) -> str:
    if upload.filename:
        return Path(upload.filename).suffix.lower()
    return ""

# --- Dependency wiring -----------------------------------------------------

_repository: ArwenDatabaseClient | None = None
_gemini_service: GeminiService | None = None
_auth_repository: AuthRepository | None = None
_auth_service: AuthService | None = None

def get_db() -> ArwenDatabaseClient:
    global _repository
    if _repository is None:
        _repository = ArwenDatabaseClient()
    return _repository

def get_gemini_service() -> GeminiService:
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiService()
    return _gemini_service

def get_auth_service() -> AuthService:
    global _auth_repository, _auth_service
    if _auth_repository is None:
        # AuthRepository uses ArwenDatabaseClient inside
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

def get_doctor(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.DOCTOR:
        raise HTTPException(status_code=403, detail="Doctor access required")
    return user

# --- App -------------------------------------------------------------------

app = FastAPI(title="Arwen Agent API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Auth routes ---

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

@app.get("/api/patient/profile")
def get_profile(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "patient_id": user.patient_id
    }

@app.get("/api/doctor/patients/search", response_model=list[PatientSearchResult])
def search_patients(query: str, doctor: User = Depends(get_doctor)):
    return get_db().search_patients(query)

@app.get("/api/doctor/patients/{patient_id}/card", response_model=PatientCard)
def get_patient_for_doctor(patient_id: str, doctor: User = Depends(get_doctor)):
    return get_db().get_patient_card(patient_id)

@app.put("/api/doctor/patients/{patient_id}/card", response_model=PatientCard)
def update_patient_card_for_doctor(patient_id: str, card: PatientCard, doctor: User = Depends(get_doctor)):
    get_db().update_patient_card(patient_id, card)
    return get_db().get_patient_card(patient_id)

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

# --- Ingestion & Upload ---

def map_extraction_to_legacy(extraction: IngestExtraction) -> UploadResponse:
    meds = []
    for m in extraction.medications:
        meds.append(ExtMedication(
            name=m.name,
            dosage=m.dosage,
            frequency=m.frequency,
            duration=m.duration,
            instructions=m.instructions
        ))
    
    doc = MedicalDocument(
        document_type=DocumentType.PRESCRIPTION if meds else DocumentType.OPERATION_REPORT,
        patient_name=extraction.patient_name,
        doctor_name=None,
        date=datetime.utcnow().date().isoformat(),
        medications=meds,
        procedure=extraction.procedures[0] if extraction.procedures else None,
        diagnosis=extraction.diagnosis,
        post_op_instructions=extraction.follow_ups,
        follow_up=extraction.follow_ups[0] if extraction.follow_ups else None,
        notes=f"Age: {extraction.age or 'Unknown'}. Allergies: {', '.join(extraction.allergies) if extraction.allergies else 'None'}."
    )
    
    note = ClinicalNote(
        patient_name=extraction.patient_name,
        practitioner=None,
        date=datetime.utcnow().date().isoformat(),
        chief_complaint=extraction.diagnosis,
        observations=f"Allergies: {', '.join(extraction.allergies)}. Lab Tests: {', '.join(extraction.lab_tests)}.",
        action_items=extraction.procedures + extraction.follow_ups,
        follow_up=extraction.follow_ups[0] if extraction.follow_ups else None
    )
    
    return UploadResponse(
        documents=[doc],
        clinical_note=note,
        upload_id=uuid.uuid4().hex
    )

@app.post("/api/upload", response_model=UploadResponse)
async def upload(
    patient_id: str = Depends(get_patient_id),
    files: list[UploadFile] = File(default=[]),
    audio: UploadFile | None = File(default=None),
) -> UploadResponse:
    if not files and audio is None:
        raise HTTPException(status_code=400, detail="No files provided")

    file_paths = []
    transcript_text = None

    with tempfile.TemporaryDirectory(prefix="arwen_upload_") as tmpdir:
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
            file_paths.append(dest)

        if audio is not None:
            suffix = _suffix_for(audio) or ".mp3"
            if suffix not in AUDIO_EXTENSIONS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported audio extension: {suffix}",
                )
            dest = tmp_path / f"{uuid.uuid4().hex}{suffix}"
            dest.write_bytes(await audio.read())
            file_paths.append(dest)
            # Standard transcript hint for Gemini multimodal audio processing
            transcript_text = "Clinical voice note recording uploaded."

        try:
            # Extract using Gemini
            extraction = get_gemini_service().extract_medical_info(file_paths, transcript_text)
            
            # Save raw extraction info into Documents collection
            doc_dict = extraction.model_dump()
            doc_dict["patient_id"] = patient_id
            get_db().save_document(doc_dict)
            
            # Translate to legacy UploadResponse format for front-end
            return map_extraction_to_legacy(extraction)
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to process files via Gemini 1.5 Flash: {exc}",
            ) from exc


@app.post("/api/ingest", response_model=IngestExtraction)
def ingest(request: IngestRequest, patient_id: str = Depends(get_patient_id)) -> IngestExtraction:
    prompt = (
        f"Extract structured medical details from the following patient documents:\n\n"
        f"Prescription:\n{request.prescription or 'None'}\n\n"
        f"Discharge Summary:\n{request.discharge_summary or 'None'}\n\n"
        f"Clinical Notes:\n{request.clinical_notes or 'None'}\n\n"
        f"Transcript:\n{request.transcript or 'None'}\n"
    )
    schema = {
        "type": "OBJECT",
        "properties": {
            "patient_name": {"type": "STRING"},
            "age": {"type": "INTEGER"},
            "diagnosis": {"type": "STRING"},
            "medications": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"},
                        "dosage": {"type": "STRING"},
                        "frequency": {"type": "STRING"},
                        "duration": {"type": "STRING"},
                        "instructions": {"type": "STRING"}
                    },
                    "required": ["name"]
                }
            },
            "procedures": {
                "type": "ARRAY",
                "items": {"type": "STRING"}
            },
            "allergies": {
                "type": "ARRAY",
                "items": {"type": "STRING"}
            },
            "follow_ups": {
                "type": "ARRAY",
                "items": {"type": "STRING"}
            },
            "lab_tests": {
                "type": "ARRAY",
                "items": {"type": "STRING"}
            }
        }
    }
    
    # Run direct schema validation extraction with retry
    retries = 3
    for attempt in range(retries):
        try:
            raw_response = get_gemini_service()._call_gemini(prompt, response_schema=schema)
            extraction = IngestExtraction.model_validate_json(raw_response)
            
            # Save to database
            doc_dict = extraction.model_dump()
            doc_dict["patient_id"] = patient_id
            get_db().save_document(doc_dict)
            
            return extraction
        except Exception as e:
            if attempt == retries - 1:
                raise HTTPException(status_code=502, detail=f"Gemini Extraction Failed: {e}")

# --- Recovery Plan ---

@app.post("/api/recovery-plan", response_model=RecoveryPlanResponse)
def recovery_plan(request: IngestExtraction, patient_id: str = Depends(get_patient_id)) -> RecoveryPlanResponse:
    plan = get_gemini_service().generate_recovery_plan(request)
    plan_dict = plan.model_dump()
    plan_dict["patient_id"] = patient_id
    
    # Save plan to MongoDB RecoveryPlans collection
    get_db().save_plan(plan_dict)

    # Automatically update PatientCard and medication schedules
    card = get_db().get_patient_card(patient_id)
    if not card.name or card.name == "Unnamed patient":
        card.name = request.patient_name
    
    if request.diagnosis and request.diagnosis not in card.active_conditions:
        card.active_conditions.append(request.diagnosis)
        
    for med in request.medications:
        med_str = f"{med.name} {med.dosage or ''} {med.frequency or ''}".strip()
        if med_str not in card.current_treatments:
            card.current_treatments.append(med_str)
            
    for proc in request.procedures:
        if proc not in card.upcoming_procedures:
            card.upcoming_procedures.append(proc)
            
    for fup in request.follow_ups:
        if fup not in card.regular_followups:
            card.regular_followups.append(fup)
            
    for alg in request.allergies:
        if alg and alg not in card.drug_interactions:
            card.drug_interactions.append(f"Allergy: {alg}")
            
    get_db().update_patient_card(patient_id, card)

    # Save medications schedules
    new_meds = []
    for med in request.medications:
        # Create standard daily dose schedule for 7 days
        doses = []
        for i in range(7):
            doses.append({
                "id": uuid.uuid4().hex,
                "scheduled_time": datetime.utcnow().isoformat(),
                "status": "PENDING"
            })
        new_meds.append({
            "id": uuid.uuid4().hex,
            "medication_name": med.name,
            "dosage": med.dosage,
            "frequency": med.frequency,
            "instructions": med.instructions,
            "doses": doses
        })
    if new_meds:
        get_db().save_medication_schedules(patient_id, new_meds)

    # Save follow ups as appointments
    for fup in request.follow_ups:
        get_db().create_appointment({
            "patient_id": patient_id,
            "title": f"Follow-up: {fup}",
            "date": datetime.utcnow().isoformat(),
            "description": f"Extracted from discharge summary: {fup}"
        })

    return plan

@app.post("/api/recovery-plan/{plan_id}/{task_id}/toggle")
def toggle_task(plan_id: str, task_id: str, completed: bool, patient_id: str = Depends(get_patient_id)):
    get_db().update_task_status(patient_id, plan_id, task_id, completed)
    return {"status": "ok"}

# --- Reminders ---

@app.get("/api/reminders")
def get_reminders(patient_id: str = Depends(get_patient_id)):
    return get_db().get_reminders(patient_id)

@app.post("/api/reminders/create")
def create_reminder(request: ReminderRequest, patient_id: str = Depends(get_patient_id)):
    rem_dict = request.model_dump()
    rem_dict["patient_id"] = patient_id
    get_db().create_reminder(rem_dict)
    return {"status": "ok", "reminder": rem_dict}

# --- Appointments ---

@app.get("/api/appointments")
def get_appointments(patient_id: str = Depends(get_patient_id)):
    return get_db().get_appointments(patient_id)

@app.post("/api/appointments")
def create_appointment(request: AppointmentRequest, patient_id: str = Depends(get_patient_id)):
    app_dict = request.model_dump()
    app_dict["patient_id"] = patient_id
    app_dict["date"] = request.date.isoformat()
    get_db().create_appointment(app_dict)
    return {"status": "ok", "appointment": app_dict}

# --- AI Coach Chat ---

@app.post("/api/chat")
def chat_coach(request: ChatRequest, patient_id: str = Depends(get_patient_id)):
    card = get_db().get_patient_card(patient_id)
    history_ctx = get_db().get_history(patient_id)
    
    patient_context = {
        "name": card.name,
        "diagnoses": card.active_conditions,
        "medications": card.current_treatments,
        "regular_followups": card.regular_followups,
        "upcoming_procedures": card.upcoming_procedures,
        "drug_interactions": card.drug_interactions
    }
    
    chat_history = [{"role": msg.role, "content": msg.content} for msg in request.history]
    reply = get_gemini_service().ask_coach(chat_history, patient_context, request.query)
    return {"reply": reply}

# --- Backward compatibility endpoints for existing UI flow ---

@app.post("/api/plan", response_model=ActionPlan)
def legacy_plan(request: PlanRequest, patient_id: str = Depends(get_patient_id)) -> ActionPlan:
    # Uses standard PlanService
    planner = MistralPlanner(_mistral_client()) if "MISTRAL_API_KEY" in os.environ else FakePlanner()
    service = PlanService(
        planner=planner,
        repository=get_db(),
    )
    return service.plan_from_raw(
        request.documents,
        request.clinical_note,
        patient_id=patient_id,
    )

@app.post("/api/execute", response_model=ExecutionResult)
def execute(request: ExecuteRequest, patient_id: str = Depends(get_patient_id)) -> ExecutionResult:
    service = ExecutionService(repository=get_db())
    return service.execute(
        patient_id=patient_id,
        documents=request.documents,
        clinical_note=request.clinical_note,
        plan=request.plan,
        decisions=request.decisions,
    )

@app.get("/api/patient/card", response_model=PatientCard)
def patient_card(patient_id: str = Depends(get_patient_id)) -> PatientCard:
    return get_db().get_patient_card(patient_id)

@app.get("/api/patient/pending-actions", response_model=PendingActionsResponse)
def patient_pending_actions(patient_id: str = Depends(get_patient_id)) -> PendingActionsResponse:
    result = FollowupService(get_db()).pending_and_overdue(patient_id)
    return PendingActionsResponse(
        pending=result["pending"],
        overdue=result["overdue"],
    )

@app.get("/api/patient/history", response_model=PatientHistory)
def patient_history(patient_id: str = Depends(get_patient_id)) -> PatientHistory:
    return get_db().get_history(patient_id)

@app.post("/api/patient/actions/{plan_id}/{action_id}/done")
def mark_action_done(plan_id: str, action_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:
    get_db().update_action_status(
        patient_id=patient_id,
        plan_id=plan_id,
        action_id=action_id,
        status=ActionStatus.DONE,
    )
    return {"status": "ok"}

@app.get("/api/patient/medications", response_model=MedicationsResponse)
def patient_medications(patient_id: str = Depends(get_patient_id)) -> MedicationsResponse:
    schedules = get_db().get_medication_schedules(patient_id)
    total_doses = sum(len(s.doses) for s in schedules)
    taken_doses = sum(
        sum(1 for d in s.doses if d.status == DoseStatus.TAKEN) for s in schedules
    )
    adherence_score = int((taken_doses / total_doses * 100)) if total_doses > 0 else 100
    return MedicationsResponse(schedules=schedules, adherence_score=adherence_score)

@app.post("/api/patient/medications/{schedule_id}/doses/{dose_id}/mark-taken")
def mark_dose_taken(schedule_id: str, dose_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:
    get_db().db_update_dose_status(
        patient_id=patient_id,
        schedule_id=schedule_id,
        dose_id=dose_id,
        status_str="TAKEN",
    )
    return {"status": "ok"}

@app.post("/api/patient/medications/{schedule_id}/doses/{dose_id}/skip")
def skip_dose(schedule_id: str, dose_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:
    get_db().db_update_dose_status(
        patient_id=patient_id,
        schedule_id=schedule_id,
        dose_id=dose_id,
        status_str="SKIPPED",
    )
    return {"status": "ok"}

@app.get("/api/patient/timeline", response_model=list[TimelineDay])
def get_timeline(patient_id: str = Depends(get_patient_id)) -> list[TimelineDay]:
    service = TimelineService(get_db())
    return service.get_patient_timeline(patient_id=patient_id)

@app.get("/api/patient/notifications", response_model=list[Notification])
def get_notifications(patient_id: str = Depends(get_patient_id)) -> list[Notification]:
    service = NotificationService(get_db())
    return service.get_notifications(patient_id=patient_id)

@app.post("/api/patient/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, patient_id: str = Depends(get_patient_id)) -> dict[str, str]:
    service = NotificationService(get_db())
    service.mark_as_read(patient_id=patient_id, notification_id=notification_id)
    return {"status": "ok"}

@app.post("/api/coach", response_model=CoachSummary)
def generate_coach_summary(context: CoachContext, patient_id: str = Depends(get_patient_id)) -> CoachSummary:
    try:
        return get_gemini_service().generate_coach_summary(context)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate coach summary: {exc}"
        )

# Legacy classes for backward compatibility
class FakePlanner:
    def plan(self, patient_input):
        return ActionPlan()
class MistralPlanner:
    def __init__(self, client):
        pass
    def plan(self, patient_input):
        return ActionPlan()
