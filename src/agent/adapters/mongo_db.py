import os
import uuid
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from pymongo import MongoClient

from ..domain.ports.repository import PatientRepository
from ..domain.models.actions import Action
from ..domain.models.vault import (
    ActionStatus,
    Consultation,
    DoseStatus,
    MedicationSchedule,
    PatientCard,
    PatientHistory,
    StoredActionPlan,
    PatientSearchResult,
)

logger = logging.getLogger(__name__)

class ArwenDatabaseClient(PatientRepository):
    def __init__(self, uri: Optional[str] = None) -> None:
        self.uri = uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        self.is_mock = False
        try:
            self.client = MongoClient(self.uri, serverSelectionTimeoutMS=1500)
            self.client.admin.command('ping')
            self.db = self.client["arwen"]
            logger.info("Connected to MongoDB successfully.")
            self._setup_indices()
        except Exception as e:
            logger.warning(f"Could not connect to MongoDB at {self.uri} ({e}). Falling back to in-memory database.")
            self.is_mock = True
            self._mock_db: Dict[str, List[Dict[str, Any]]] = {
                "users": [],
                "patients": [],
                "documents": [],
                "recovery_plans": [],
                "medications": [],
                "appointments": [],
                "reminders": []
            }

    def _setup_indices(self) -> None:
        if self.is_mock:
            return
        self.db["users"].create_index("email", unique=True)
        self.db["patients"].create_index("id", unique=True)
        self.db["documents"].create_index("patient_id")
        self.db["recovery_plans"].create_index("patient_id")
        self.db["medications"].create_index("patient_id")
        self.db["appointments"].create_index("patient_id")
        self.db["reminders"].create_index("patient_id")

    # --- Users Collection ---

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        if self.is_mock:
            for u in self._mock_db["users"]:
                if u.get("email") == email:
                    return u
            return None
        return self.db["users"].find_one({"email": email})

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        if self.is_mock:
            for u in self._mock_db["users"]:
                if u.get("id") == user_id:
                    return u
            return None
        return self.db["users"].find_one({"id": user_id})

    def save_user(self, user_dict: Dict[str, Any]) -> None:
        if self.is_mock:
            for i, u in enumerate(self._mock_db["users"]):
                if u.get("id") == user_dict["id"]:
                    self._mock_db["users"][i] = user_dict
                    return
            self._mock_db["users"].append(user_dict)
            return
        self.db["users"].replace_one({"id": user_dict["id"]}, user_dict, upsert=True)

    # --- Documents Collection ---

    def save_document(self, doc_dict: Dict[str, Any]) -> None:
        doc_dict["created_at"] = datetime.utcnow()
        if "id" not in doc_dict:
            doc_dict["id"] = uuid.uuid4().hex
        if self.is_mock:
            self._mock_db["documents"].append(doc_dict)
            return
        self.db["documents"].insert_one(doc_dict)

    def list_documents(self, patient_id: str) -> List[Dict[str, Any]]:
        if self.is_mock:
            return [d for d in self._mock_db["documents"] if d.get("patient_id") == patient_id]
        return list(self.db["documents"].find({"patient_id": patient_id}))

    # --- RecoveryPlans Collection ---

    def get_latest_plan(self, patient_id: str) -> Optional[Dict[str, Any]]:
        if self.is_mock:
            plans = [p for p in self._mock_db["recovery_plans"] if p.get("patient_id") == patient_id]
            if not plans:
                return None
            return sorted(plans, key=lambda x: x.get("created_at"), reverse=True)[0]
        cursor = self.db["recovery_plans"].find({"patient_id": patient_id}).sort([("created_at", -1)]).limit(1)
        res = list(cursor)
        return res[0] if res else None

    def save_plan(self, plan_dict: Dict[str, Any]) -> None:
        plan_dict["created_at"] = datetime.utcnow()
        if "id" not in plan_dict:
            plan_dict["id"] = uuid.uuid4().hex
        if self.is_mock:
            self._mock_db["recovery_plans"].append(plan_dict)
            return
        self.db["recovery_plans"].insert_one(plan_dict)

    def update_task_status(self, patient_id: str, plan_id: str, task_id: str, completed: bool) -> None:
        if self.is_mock:
            for plan in self._mock_db["recovery_plans"]:
                if plan.get("patient_id") == patient_id and plan.get("id") == plan_id:
                    for list_name in ["critical_tasks", "important_tasks", "optional_tasks"]:
                        for task in plan.get(list_name, []):
                            if task.get("id") == task_id:
                                task["completed"] = completed
                                return
            return
        # MongoDB multi updates
        self.db["recovery_plans"].update_one(
            {"patient_id": patient_id, "id": plan_id, "critical_tasks.id": task_id},
            {"$set": {"critical_tasks.$.completed": completed}}
        )
        self.db["recovery_plans"].update_one(
            {"patient_id": patient_id, "id": plan_id, "important_tasks.id": task_id},
            {"$set": {"important_tasks.$.completed": completed}}
        )
        self.db["recovery_plans"].update_one(
            {"patient_id": patient_id, "id": plan_id, "optional_tasks.id": task_id},
            {"$set": {"optional_tasks.$.completed": completed}}
        )

    # --- Medications (MedicationSchedules) Helpers ---

    def get_medications(self, patient_id: str) -> List[Dict[str, Any]]:
        if self.is_mock:
            return [m for m in self._mock_db["medications"] if m.get("patient_id") == patient_id]
        return list(self.db["medications"].find({"patient_id": patient_id}))

    def save_medication_schedules(self, patient_id: str, new_schedules: List[Dict[str, Any]]) -> None:
        for sched in new_schedules:
            sched["patient_id"] = patient_id
            if "id" not in sched:
                sched["id"] = uuid.uuid4().hex
            # convert dates to ISO strings in doses
            if "doses" in sched:
                for dose in sched["doses"]:
                    if isinstance(dose.get("scheduled_time"), datetime):
                        dose["scheduled_time"] = dose["scheduled_time"].isoformat()
                    if isinstance(dose.get("taken_at"), datetime):
                        dose["taken_at"] = dose["taken_at"].isoformat()
            if self.is_mock:
                self._mock_db["medications"].append(sched)
            else:
                self.db["medications"].replace_one({"id": sched["id"]}, sched, upsert=True)

    # --- Appointments Collection ---

    def get_appointments(self, patient_id: str) -> List[Dict[str, Any]]:
        if self.is_mock:
            return [a for a in self._mock_db["appointments"] if a.get("patient_id") == patient_id]
        return list(self.db["appointments"].find({"patient_id": patient_id}))

    def create_appointment(self, appointment_dict: Dict[str, Any]) -> None:
        if "id" not in appointment_dict:
            appointment_dict["id"] = uuid.uuid4().hex
        if self.is_mock:
            self._mock_db["appointments"].append(appointment_dict)
            return
        self.db["appointments"].insert_one(appointment_dict)

    # --- Reminders Collection ---

    def get_reminders(self, patient_id: str) -> List[Dict[str, Any]]:
        if self.is_mock:
            return [r for r in self._mock_db["reminders"] if r.get("patient_id") == patient_id]
        return list(self.db["reminders"].find({"patient_id": patient_id}))

    def create_reminder(self, reminder_dict: Dict[str, Any]) -> None:
        if "id" not in reminder_dict:
            reminder_dict["id"] = uuid.uuid4().hex
        if self.is_mock:
            self._mock_db["reminders"].append(reminder_dict)
            return
        self.db["reminders"].insert_one(reminder_dict)

    # --- PatientRepository Interface Implementations ---

    def get_patient_card(self, patient_id: str) -> PatientCard:
        if self.is_mock:
            for p in self._mock_db["patients"]:
                if p.get("id") == patient_id:
                    p_copy = dict(p)
                    p_copy.pop("id", None)
                    p_copy.pop("_id", None)
                    return PatientCard(**p_copy)
            return PatientCard()
        doc = self.db["patients"].find_one({"id": patient_id})
        if not doc:
            return PatientCard()
        doc.pop("_id", None)
        doc.pop("id", None)
        return PatientCard(**doc)

    def update_patient_card(self, patient_id: str, card: PatientCard) -> None:
        card_dict = card.model_dump()
        card_dict["id"] = patient_id
        card_dict["last_updated"] = datetime.utcnow()
        if self.is_mock:
            for i, p in enumerate(self._mock_db["patients"]):
                if p.get("id") == patient_id:
                    self._mock_db["patients"][i] = card_dict
                    return
            self._mock_db["patients"].append(card_dict)
            return
        self.db["patients"].replace_one({"id": patient_id}, card_dict, upsert=True)

    def search_patients(self, query: str) -> List[PatientSearchResult]:
        if self.is_mock:
            results = []
            q = query.lower()
            for p in self._mock_db["patients"]:
                pid = str(p.get("id", ""))
                name = str(p.get("name", ""))
                if q in pid.lower() or q in name.lower():
                    p_copy = dict(p)
                    p_copy.pop("id", None)
                    p_copy.pop("_id", None)
                    results.append(PatientSearchResult(id=pid, card=PatientCard(**p_copy)))
            return results
        
        cursor = self.db["patients"].find({
            "$or": [
                {"id": {"$regex": query, "$options": "i"}},
                {"name": {"$regex": query, "$options": "i"}}
            ]
        })
        results = []
        for doc in cursor:
            doc.pop("_id", None)
            pid = doc.pop("id", None)
            if not pid: continue
            results.append(PatientSearchResult(id=pid, card=PatientCard(**doc)))
        return results

    def save_consultation(self, patient_id: str, consultation: Consultation) -> None:
        doc_dict = consultation.model_dump()
        doc_dict["patient_id"] = patient_id
        self.save_document(doc_dict)

    def save_action_plan(self, patient_id: str, stored_plan: StoredActionPlan) -> None:
        plan_dict = stored_plan.model_dump()
        plan_dict["patient_id"] = patient_id
        self.save_plan(plan_dict)

    def update_action_status(
        self,
        patient_id: str,
        plan_id: str,
        action_id: str,
        status: ActionStatus,
        result: Optional[dict] = None,
    ) -> None:
        if self.is_mock:
            for plan in self._mock_db["recovery_plans"]:
                if plan.get("patient_id") == patient_id and plan.get("id") == plan_id:
                    for ta in plan.get("tracked_actions", []):
                        if ta.get("action", {}).get("id") == action_id:
                            ta["status"] = status.value
                            ta["executed_at"] = datetime.utcnow().isoformat()
                            if result is not None:
                                ta["result"] = result
                            return
            return
        self.db["recovery_plans"].update_one(
            {"patient_id": patient_id, "id": plan_id, "tracked_actions.action.id": action_id},
            {"$set": {
                "tracked_actions.$.status": status.value,
                "tracked_actions.$.executed_at": datetime.utcnow()
            }}
        )
        if result is not None:
            self.db["recovery_plans"].update_one(
                {"patient_id": patient_id, "id": plan_id, "tracked_actions.action.id": action_id},
                {"$set": {"tracked_actions.$.result": result}}
            )

    def list_pending_actions(self, patient_id: str) -> list[Action]:
        if self.is_mock:
            plans = [p for p in self._mock_db["recovery_plans"] if p.get("patient_id") == patient_id]
        else:
            plans = list(self.db["recovery_plans"].find({"patient_id": patient_id}))
        
        pending = []
        for plan in plans:
            for ta in plan.get("tracked_actions", []):
                if ta.get("status") in [ActionStatus.PENDING.value, ActionStatus.OVERDUE.value]:
                    action_data = ta.get("action")
                    pending.append(Action(**action_data))
        return pending

    def get_medication_schedules(self, patient_id: str) -> list[MedicationSchedule]:
        meds = self.get_medications(patient_id)
        res = []
        for m in meds:
            m_copy = dict(m)
            m_copy.pop("_id", None)
            m_copy.pop("patient_id", None)
            res.append(MedicationSchedule(**m_copy))
        return res

    def add_medication_schedules(self, patient_id: str, new_schedules: list[MedicationSchedule]) -> None:
        sched_dicts = [s.model_dump() for s in new_schedules]
        self.save_medication_schedules(patient_id, sched_dicts)

    def update_dose_status(self, patient_id: str, schedule_id: str, dose_id: str, status: DoseStatus) -> None:
        self.db_update_dose_status(patient_id, schedule_id, dose_id, status.value)

    def db_update_dose_status(self, patient_id: str, schedule_id: str, dose_id: str, status_str: str) -> None:
        if self.is_mock:
            for sched in self._mock_db["medications"]:
                if sched.get("patient_id") == patient_id and sched.get("id") == schedule_id:
                    for dose in sched.get("doses", []):
                        if dose.get("id") == dose_id:
                            dose["status"] = status_str
                            dose["taken_at"] = datetime.utcnow().isoformat() if status_str == "TAKEN" else None
                            return
            return
        self.db["medications"].update_one(
            {"patient_id": patient_id, "id": schedule_id, "doses.id": dose_id},
            {"$set": {
                "doses.$.status": status_str,
                "doses.$.taken_at": datetime.utcnow().isoformat() if status_str == "TAKEN" else None
            }}
        )

    def get_history(self, patient_id: str) -> PatientHistory:
        card = self.get_patient_card(patient_id)
        if self.is_mock:
            docs = [d for d in self._mock_db["documents"] if d.get("patient_id") == patient_id]
            plans = [p for p in self._mock_db["recovery_plans"] if p.get("patient_id") == patient_id]
        else:
            docs = list(self.db["documents"].find({"patient_id": patient_id}))
            plans = list(self.db["recovery_plans"].find({"patient_id": patient_id}))
            
        meds = self.get_medication_schedules(patient_id)
        
        consultations = []
        for d in docs:
            d_copy = dict(d)
            d_copy.pop("_id", None)
            d_copy.pop("patient_id", None)
            d_copy.pop("created_at", None)
            consultations.append(Consultation(**d_copy))
            
        action_plans = []
        for p in plans:
            p_copy = dict(p)
            p_copy.pop("_id", None)
            p_copy.pop("patient_id", None)
            p_copy.pop("created_at", None)
            action_plans.append(StoredActionPlan(**p_copy))
            
        return PatientHistory(
            patient_id=patient_id,
            patient_card=card,
            consultations=consultations,
            action_plans=action_plans,
            medication_schedules=meds
        )
