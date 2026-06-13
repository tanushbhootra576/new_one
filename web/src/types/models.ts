// ── Extractor types ────────────────────────────────────────────────────────

export type DocumentType = "prescription" | "operation_report" | "other";

export interface Medication {
  name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
}

export interface MedicalDocument {
  document_type: DocumentType;
  patient_name: string | null;
  doctor_name: string | null;
  doctor_id?: string | null;
  date: string | null;
  medications: Medication[];
  procedure: string | null;
  diagnosis: string | null;
  operative_findings: string | null;
  post_op_instructions: string[];
  follow_up: string | null;
  notes: string | null;
}

export interface ClinicalNote {
  patient_name: string | null;
  practitioner: string | null;
  date: string | null;
  chief_complaint: string | null;
  observations: string | null;
  action_items: string[];
  follow_up: string | null;
}

// ── Agent types ────────────────────────────────────────────────────────────

export type ActionType =
  | "BOOK_LAB"
  | "BOOK_IMAGING"
  | "BOOK_APPOINTMENT"
  | "BOOK_TRANSPORT"
  | "ADD_REMINDER"
  | "TAKE_MEDICATION"
  | "QUESTION_FOR_DOCTOR";

export type Priority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";

export interface Action {
  id: string;
  type: ActionType;
  title: string;
  why: string;
  deadline: string | null;
  constraints: string[];
  depends_on: string[];
  priority: Priority;
  group_with: string | null;
  suggested_url: string | null;
}

export interface QuestionBundle {
  appointment: string;
  questions: string[];
  reasoning: string;
}

export interface ActionPlan {
  actions: Action[];
  questions_for_next_appointments: QuestionBundle[];
  alerts: string[];
  patient_card_updates: Record<string, unknown>[];
}

// ── API envelopes ──────────────────────────────────────────────────────────

export interface PlanRequest {
  documents: MedicalDocument[];
  clinical_note: ClinicalNote | null;
}

export interface UploadResponse {
  documents: MedicalDocument[];
  clinical_note: ClinicalNote | null;
  upload_id: string;
}

export type Decision = "ACCEPT" | "REJECT" | "MODIFY";

export interface ValidatedAction {
  id: string;
  decision: Decision;
  overrides?: {
    title?: string;
    deadline?: string;
    notes?: string;
  };
}

export interface ActionDecision {
  action_id: string;
  decision: Decision;
  overrides: Record<string, unknown>;
}

export interface ExecuteRequest {
  documents: MedicalDocument[];
  clinical_note: ClinicalNote | null;
  plan: ActionPlan;
  decisions: ActionDecision[];
}

export type ActionStatus = "PENDING" | "DONE" | "FAILED" | "SKIPPED" | "OVERDUE";

export interface ExecutedAction {
  action: Action;
  status: ActionStatus;
  result: Record<string, unknown>;
}

export interface PatientCard {
  name: string | null;
  address: string | null;
  active_conditions: string[];
  current_treatments: string[];
  regular_followups: string[];
  upcoming_procedures: string[];
  drug_interactions: string[];
  last_updated: string | null;
}

export interface ExecutionResult {
  executed_actions: ExecutedAction[];
  updated_card: PatientCard | null;
}

export type DoseStatus = "PENDING" | "TAKEN" | "SKIPPED";

export interface ScheduledDose {
  id: string;
  scheduled_time: string;
  status: DoseStatus;
  taken_at: string | null;
}

export interface MedicationSchedule {
  id: string;
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  instructions: string | null;
  doses: ScheduledDose[];
}

export type NotificationType = "medication" | "appointment" | "task";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  created_at: string;
  is_read: boolean;
}


export interface MedicationsResponse {
  schedules: MedicationSchedule[];
  adherence_score: number;
}

export type TimelineItemType = "medication" | "test" | "appointment" | "follow_up";
export type TimelineStatus = "pending" | "completed" | "missed";

export interface TimelineItem {
  id: string;
  date: string;
  type: TimelineItemType;
  title: string;
  description: string | null;
  status: TimelineStatus;
}

export interface TimelineDay {
  label: string;
  date: string | null;
  items: TimelineItem[];
}

export interface CoachContext {
  patient_card: Record<string, unknown>;
  timeline: Record<string, unknown>[];
}

export interface CoachSummary {
  daily_summary: string;
  priorities: string[];
  risks: string[];
  questions: string[];
  encouragement: string;
  follow_up: string[];
}

export enum UserRole {
  PATIENT = "PATIENT",
  DOCTOR = "DOCTOR",
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  patient_id: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}
