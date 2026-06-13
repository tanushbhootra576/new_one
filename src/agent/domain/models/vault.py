from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from extractor.models import ClinicalNote, MedicalDocument

from .actions import Action, ActionPlan


class ActionStatus(str, Enum):
    PENDING = "PENDING"
    DONE = "DONE"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"
    OVERDUE = "OVERDUE"


class PatientCard(BaseModel):
    """Identity card of the patient — evolves across consultations."""

    name: str | None = None
    address: str | None = None
    active_conditions: list[str] = Field(default_factory=list)
    current_treatments: list[str] = Field(default_factory=list)
    regular_followups: list[str] = Field(
        default_factory=list, description="Doctors seen regularly"
    )
    upcoming_procedures: list[str] = Field(default_factory=list)
    drug_interactions: list[str] = Field(default_factory=list)
    last_updated: datetime | None = None


class Consultation(BaseModel):
    """A single consultation snapshot — the raw extractor output plus metadata."""

    id: str
    date: datetime
    practitioner: str | None = None
    documents: list[MedicalDocument] = Field(default_factory=list)
    clinical_note: ClinicalNote | None = None


class TrackedAction(BaseModel):
    """An Action with its lifecycle status, as stored in the vault."""

    action: Action
    status: ActionStatus = ActionStatus.PENDING
    executed_at: datetime | None = None
    result: dict[str, Any] = Field(
        default_factory=dict,
        description="Execution output (ics content, url, error message, ...)",
    )


class StoredActionPlan(BaseModel):
    """An ActionPlan persisted with per-action status and a link to its consultation."""

    id: str
    created_at: datetime
    consultation_id: str
    plan: ActionPlan
    tracked_actions: list[TrackedAction] = Field(default_factory=list)


class EventType(str, Enum):
    CONSULTATION = "CONSULTATION"
    ACTION_DONE = "ACTION_DONE"
    ACTION_SKIPPED = "ACTION_SKIPPED"
    ACTION_FAILED = "ACTION_FAILED"
    ALERT = "ALERT"
    CHECK_IN = "CHECK_IN"


class Event(BaseModel):
    date: datetime
    type: EventType
    summary: str
    ref_id: str | None = Field(
        default=None,
        description="Id of the related consultation / action / plan",
    )


class DoseStatus(str, Enum):
    PENDING = "PENDING"
    TAKEN = "TAKEN"
    SKIPPED = "SKIPPED"


class ScheduledDose(BaseModel):
    id: str = Field(description="Unique id for this specific dose")
    scheduled_time: datetime
    status: DoseStatus = DoseStatus.PENDING
    taken_at: datetime | None = None


class MedicationSchedule(BaseModel):
    id: str
    medication_name: str
    dosage: str | None = None
    frequency: str | None = None
    instructions: str | None = None
    doses: list[ScheduledDose] = Field(default_factory=list)


class NotificationType(str, Enum):
    MEDICATION = "medication"
    APPOINTMENT = "appointment"
    TASK = "task"


class Notification(BaseModel):
    id: str
    title: str
    message: str
    type: NotificationType
    created_at: datetime
    is_read: bool = False


class PatientHistory(BaseModel):
    """Full aggregate persisted in the vault."""

    patient_id: str
    patient_card: PatientCard = Field(default_factory=PatientCard)
    consultations: list[Consultation] = Field(default_factory=list)
    action_plans: list[StoredActionPlan] = Field(default_factory=list)
    timeline: list[Event] = Field(default_factory=list)
    medication_schedules: list[MedicationSchedule] = Field(default_factory=list)
    notifications: list[Notification] = Field(default_factory=list)


class PatientSearchResult(BaseModel):
    id: str
    card: PatientCard
