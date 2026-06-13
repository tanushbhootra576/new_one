import type {
  ActionDecision,
  ActionPlan,
  ClinicalNote,
  ExecuteRequest,
  ExecutionResult,
  MedicalDocument,
  MedicationsResponse,
  Notification,
  PatientCard,
  TimelineDay,
  UploadResponse,
  ValidatedAction,
  CoachContext,
  CoachSummary,
} from "@/types/models";
import { mockUploadResponse, mockActionPlan, mockDocuments, mockClinicalNote } from "@/fixtures/urology_case";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Step 1 — Upload documents + optional audio note.
 * Real POST /api/upload call; falls back to mock if VITE_USE_MOCKS=true.
 */
export async function uploadDocuments(
  files: File[],
  audio?: File
): Promise<UploadResponse> {
  if (USE_MOCKS) {
    await delay(1500);
    return mockUploadResponse;
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  if (audio) {
    formData.append("audio", audio);
  }

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/upload failed: ${response.status} — ${text}`);
  }

  return response.json() as Promise<UploadResponse>;
}

/**
 * Step 2 — Get action plan.
 * Real POST /api/plan call; falls back to mock if VITE_USE_MOCKS=true.
 */
export async function getPlan(
  documents: MedicalDocument[],
  clinical_note: ClinicalNote | null
): Promise<ActionPlan> {
  if (USE_MOCKS) {
    await delay(800);
    return mockActionPlan;
  }

  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documents, clinical_note }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/plan failed: ${response.status} — ${text}`);
  }

  return response.json() as Promise<ActionPlan>;
}

/**
 * Step 3 — Execute plan via POST /api/execute.
 * Backend persists the consultation to the vault, runs Pass 2 (Doctolib URLs,
 * .ics generation), updates the PatientCard, and returns the full ExecutionResult.
 */
export async function executePlan(
  plan: ActionPlan,
  decisions: ValidatedAction[],
  documents: MedicalDocument[],
  clinical_note: ClinicalNote | null
): Promise<ExecutionResult> {
  if (USE_MOCKS) {
    await delay(800);
    // Simulate Pass 2: apply decisions, add Doctolib URLs, build updated card
    const rejectedIds = new Set(decisions.filter((d) => d.decision === "REJECT").map((d) => d.id));
    const executedActions = plan.actions.map((action) => {
      if (rejectedIds.has(action.id)) {
        return { action, status: "SKIPPED" as const, result: { reason: "rejected by patient" } };
      }
      const dec = decisions.find((d) => d.id === action.id);
      const effectiveAction =
        dec?.decision === "MODIFY" && dec.overrides
          ? { ...action, ...(dec.overrides as Partial<typeof action>) }
          : action;
      const result: Record<string, string> = {};
      if (effectiveAction.suggested_url) result["suggested_url"] = effectiveAction.suggested_url;
      return { action: effectiveAction, status: "PENDING" as const, result };
    });
    const acceptedDocs = documents.length > 0 ? documents : mockDocuments;
    const acceptedNote = clinical_note ?? mockClinicalNote;
    return {
      executed_actions: executedActions,
      updated_card: {
        name: acceptedNote.patient_name ?? acceptedDocs[0]?.patient_name ?? "Pierre Muller",
        address: "14 impasse des Pins, 30000 Nîmes",
        active_conditions: ["Urolithiasis — right ureteral calculus 8mm"],
        current_treatments: ["Lithium (Téralithe 400mg/day) — ongoing", "Amoxicillin 1g — post-op 5 days"],
        regular_followups: ["Dr. Laurent Muller — Urology, CHU Nîmes", "Dr. Faure — Psychiatry"],
        upcoming_procedures: ["Ureteroscopy — April 24, 2026 — CHU Nîmes"],
        drug_interactions: ["⚠️ Lithium × renal procedure — monitor lithium levels post-op"],
        last_updated: new Date().toISOString(),
      },
    };
  }

  const backendDecisions: ActionDecision[] = decisions.map((d) => ({
    action_id: d.id,
    decision: d.decision,
    overrides: (d.overrides ?? {}) as Record<string, unknown>,
  }));

  const body: ExecuteRequest = {
    documents,
    clinical_note,
    plan,
    decisions: backendDecisions,
  };

  const response = await fetch("/api/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/execute failed: ${response.status} — ${text}`);
  }

  return response.json() as Promise<ExecutionResult>;
}

/**
 * Fetch the current PatientCard from the vault.
 */
export async function getPatientCard(): Promise<PatientCard> {
  if (USE_MOCKS) {
    await delay(200);
    return {
      name: "Pierre Muller",
      address: null,
      active_conditions: ["Urolithiasis — calculus 8mm"],
      current_treatments: ["Lithium (Téralithe 400) 400mg"],
      regular_followups: ["Dr. Laurent Muller", "Dr. Faure"],
      upcoming_procedures: ["Ureteroscopy — 2026-04-24"],
      drug_interactions: ["Lithium × renal procedure"],
      last_updated: new Date().toISOString(),
    };
  }

  const response = await fetch("/api/patient/card");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GET /api/patient/card failed: ${response.status} — ${text}`);
  }
  return response.json() as Promise<PatientCard>;
}

export async function getMedications(): Promise<MedicationsResponse> {
  if (USE_MOCKS) {
    await delay(200);
    return {
      schedules: [],
      adherence_score: 100,
    };
  }
  const response = await fetch("/api/patient/medications");
  if (!response.ok) throw new Error("Failed to fetch medications");
  return response.json() as Promise<MedicationsResponse>;
}

export async function markDoseTaken(scheduleId: string, doseId: string): Promise<void> {
  if (USE_MOCKS) { await delay(200); return; }
  const response = await fetch(`/api/patient/medications/${scheduleId}/doses/${doseId}/mark-taken`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to mark dose taken");
}

export async function skipDose(scheduleId: string, doseId: string): Promise<void> {
  if (USE_MOCKS) { await delay(200); return; }
  const response = await fetch(`/api/patient/medications/${scheduleId}/doses/${doseId}/skip`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to skip dose");
}

export async function getTimeline(): Promise<TimelineDay[]> {
  if (USE_MOCKS) {
    await delay(200);
    return [];
  }
  const response = await fetch("/api/patient/timeline");
  if (!response.ok) throw new Error("Failed to fetch timeline");
  return response.json() as Promise<TimelineDay[]>;
}

export async function getNotifications(): Promise<Notification[]> {
  if (USE_MOCKS) return [];
  const response = await fetch("/api/patient/notifications");
  if (!response.ok) throw new Error("Failed to fetch notifications");
  return response.json() as Promise<Notification[]>;
}

export async function markNotificationRead(id: string): Promise<void> {
  if (USE_MOCKS) return;
  const response = await fetch(`/api/patient/notifications/${id}/read`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to mark notification read");
}

export async function getCoachSummary(context: CoachContext): Promise<CoachSummary> {
  if (USE_MOCKS) {
    await delay(1500);
    return {
      daily_summary: "You are doing great on your recovery journey. Keep taking your medications and resting.",
      priorities: ["Take Lithium 400mg", "Drink plenty of water"],
      risks: ["Watch out for lithium toxicity signs like nausea."],
      questions: ["When can I resume normal activities?", "Should I continue taking Amoxicillin?"],
      encouragement: "Every step forward is progress. You've got this!",
      follow_up: ["Rest well", "Maintain regular diet"]
    };
  }

  const response = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/coach failed: ${response.status} — ${text}`);
  }

  return response.json() as Promise<CoachSummary>;
}
