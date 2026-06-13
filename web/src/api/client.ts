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

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

function buildUrl(path: string): string {
  const patientId = localStorage.getItem("active_patient_id");
  if (patientId) {
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}patient_id=${encodeURIComponent(patientId)}`;
  }
  return path;
}


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

  const response = await fetch(buildUrl("/api/upload"), {
    method: "POST",
    body: formData,
    headers: getAuthHeaders(),
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

  const response = await fetch(buildUrl("/api/plan"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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

  const response = await fetch(buildUrl("/api/execute"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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

  const response = await fetch(buildUrl("/api/patient/card"), { headers: getAuthHeaders() });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GET /api/patient/card failed: ${response.status} — ${text}`);
  }
  return response.json() as Promise<PatientCard>;
}

export async function getMedications(): Promise<MedicationsResponse> {
  if (USE_MOCKS) {
    await delay(200);
    const store = localStorage.getItem("arwen_mock_medications");
    let schedules = store ? JSON.parse(store) : [
      {
        id: "sched-1",
        medication_name: "Amoxicillin",
        dosage: "1g",
        frequency: "twice a day",
        instructions: "Take with food",
        doses: [
          { id: "dose-1a", scheduled_time: new Date().toISOString(), status: "PENDING" },
          { id: "dose-1b", scheduled_time: new Date(Date.now() + 12*3600000).toISOString(), status: "PENDING" }
        ]
      },
      {
        id: "sched-2",
        medication_name: "Lithium (Téralithe 400)",
        dosage: "400mg",
        frequency: "once a day",
        instructions: "Existing treatment - evening",
        doses: [
          { id: "dose-2a", scheduled_time: new Date().toISOString(), status: "PENDING" }
        ]
      }
    ];

    if (!store) {
      localStorage.setItem("arwen_mock_medications", JSON.stringify(schedules));
    }

    const totalDoses = schedules.reduce((acc: number, s: any) => acc + s.doses.length, 0);
    const takenDoses = schedules.reduce((acc: number, s: any) => acc + s.doses.filter((d: any) => d.status === "TAKEN").length, 0);
    const adherence_score = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 100;

    return { schedules, adherence_score };
  }
  const response = await fetch(buildUrl("/api/patient/medications"), { headers: getAuthHeaders() });
  if (!response.ok) throw new Error("Failed to fetch medications");
  return response.json() as Promise<MedicationsResponse>;
}

export async function markDoseTaken(scheduleId: string, doseId: string): Promise<void> {
  if (USE_MOCKS) {
    await delay(200);
    const store = localStorage.getItem("arwen_mock_medications");
    if (store) {
      const schedules = JSON.parse(store);
      const sched = schedules.find((s: any) => s.id === scheduleId);
      if (sched) {
        const dose = sched.doses.find((d: any) => d.id === doseId);
        if (dose) {
          dose.status = "TAKEN";
          localStorage.setItem("arwen_mock_medications", JSON.stringify(schedules));
        }
      }
    }
    return;
  }
  const response = await fetch(buildUrl(`/api/patient/medications/${scheduleId}/doses/${doseId}/mark-taken`), { method: "POST", headers: getAuthHeaders() });
  if (!response.ok) throw new Error("Failed to mark dose taken");
}

export async function skipDose(scheduleId: string, doseId: string): Promise<void> {
  if (USE_MOCKS) {
    await delay(200);
    const store = localStorage.getItem("arwen_mock_medications");
    if (store) {
      const schedules = JSON.parse(store);
      const sched = schedules.find((s: any) => s.id === scheduleId);
      if (sched) {
        const dose = sched.doses.find((d: any) => d.id === doseId);
        if (dose) {
          dose.status = "SKIPPED";
          localStorage.setItem("arwen_mock_medications", JSON.stringify(schedules));
        }
      }
    }
    return;
  }
  const response = await fetch(buildUrl(`/api/patient/medications/${scheduleId}/doses/${doseId}/skip`), { method: "POST", headers: getAuthHeaders() });
  if (!response.ok) throw new Error("Failed to skip dose");
}

export async function getTimeline(): Promise<TimelineDay[]> {
  if (USE_MOCKS) {
    await delay(200);
    return [
      {
        label: "Today",
        date: new Date().toISOString().split('T')[0],
        items: [
          { id: "t1", date: new Date().toISOString().split('T')[0], type: "medication", title: "Take Amoxicillin 1g", description: "Twice daily with food. Crucial to prevent post-op infection.", status: "pending" },
          { id: "t2", date: new Date().toISOString().split('T')[0], type: "follow_up", title: "Rest and Hydrate", description: "Drink at least 2.5L of water daily to flush fragments.", status: "pending" },
          { id: "app-1", date: new Date().toISOString().split('T')[0], type: "appointment", title: "Pre-op Consultation", description: "With Dr. Laurent Muller at CHU Nîmes", status: "pending" }
        ]
      }
    ];
  }
  const response = await fetch(buildUrl("/api/patient/timeline"), { headers: getAuthHeaders() });
  if (!response.ok) throw new Error("Failed to fetch timeline");
  return response.json() as Promise<TimelineDay[]>;
}

export async function getNotifications(): Promise<Notification[]> {
  if (USE_MOCKS) return [];
  const response = await fetch(buildUrl("/api/patient/notifications"), { headers: getAuthHeaders() });
  if (!response.ok) throw new Error("Failed to fetch notifications");
  return response.json() as Promise<Notification[]>;
}

export async function markNotificationRead(id: string): Promise<void> {
  if (USE_MOCKS) return;
  const response = await fetch(buildUrl(`/api/patient/notifications/${id}/read`), { method: "POST", headers: getAuthHeaders() });
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

  const response = await fetch(buildUrl("/api/coach"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(context),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/coach failed: ${response.status} — ${text}`);
  }

  return response.json() as Promise<CoachSummary>;
}

// ─── Reminders ───────────────────────────────────────────────────────────────

export interface Reminder {
  id: string;
  medication: string;
  dosage?: string;
  frequency?: string;
  reminder_times: string[];
}

export interface CreateReminderRequest {
  medication: string;
  dosage?: string;
  frequency?: string;
  reminder_times: string[];
}

export async function getReminders(): Promise<Reminder[]> {
  if (USE_MOCKS) {
    const list = localStorage.getItem("arwen_mock_reminders");
    return list ? JSON.parse(list) : [
      { id: "rem-1", medication: "Amoxicillin", dosage: "1g", frequency: "twice a day", reminder_times: ["08:00", "20:00"] },
      { id: "rem-2", medication: "Lithium (Téralithe 400)", dosage: "400mg", frequency: "once a day", reminder_times: ["21:00"] }
    ];
  }
  const response = await fetch(buildUrl("/api/reminders"), { headers: getAuthHeaders() });
  if (!response.ok) throw new Error("Failed to fetch reminders");
  return response.json() as Promise<Reminder[]>;
}

export async function createReminder(data: CreateReminderRequest): Promise<void> {
  if (USE_MOCKS) {
    await delay(200);
    const listStr = localStorage.getItem("arwen_mock_reminders");
    const list: Reminder[] = listStr ? JSON.parse(listStr) : [
      { id: "rem-1", medication: "Amoxicillin", dosage: "1g", frequency: "twice a day", reminder_times: ["08:00", "20:00"] },
      { id: "rem-2", medication: "Lithium (Téralithe 400)", dosage: "400mg", frequency: "once a day", reminder_times: ["21:00"] }
    ];
    const newRem: Reminder = {
      id: "rem-" + Math.random().toString(36).substring(2, 9),
      medication: data.medication,
      dosage: data.dosage,
      frequency: data.frequency,
      reminder_times: data.reminder_times
    };
    list.push(newRem);
    localStorage.setItem("arwen_mock_reminders", JSON.stringify(list));
    return;
  }
  const response = await fetch(buildUrl("/api/reminders/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create reminder");
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  title: string;
  doctor_name?: string;
  date: string;
  description?: string;
}

export async function getAppointments(): Promise<Appointment[]> {
  if (USE_MOCKS) {
    return [
      { id: "app-1", title: "Pre-op Consultation", doctor_name: "Dr. Laurent Muller", date: "2026-04-17T10:00:00Z", description: "Bring latest lab reports" },
      { id: "app-2", title: "Ureteroscopy Procedure", doctor_name: "Dr. Laurent Muller", date: "2026-04-24T08:00:00Z", description: "Fasting required from midnight" }
    ];
  }
  const response = await fetch(buildUrl("/api/appointments"), { headers: getAuthHeaders() });
  if (!response.ok) throw new Error("Failed to fetch appointments");
  return response.json() as Promise<Appointment[]>;
}

// ─── AI Coach Chat ────────────────────────────────────────────────────────────

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sendChatMessage(
  history: ChatHistoryMessage[],
  query: string
): Promise<string> {
  if (USE_MOCKS) {
    await delay(1200);
    return "Based on your medical profile, I recommend following your prescription as directed. Make sure to take your medications with food and stay well hydrated. Let me know if you have any specific concerns!";
  }
  const response = await fetch(buildUrl("/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ history, query }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST /api/chat failed: ${response.status} — ${text}`);
  }
  const data = await response.json() as { reply: string };
  return data.reply;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  patient_id?: string;
}

export async function getProfile(): Promise<UserProfile> {
  const response = await fetch(buildUrl("/api/patient/profile"), { headers: getAuthHeaders() });
  if (!response.ok) throw new Error("Failed to fetch profile");
  return response.json() as Promise<UserProfile>;
}

// ─── Doctor Endpoints ─────────────────────────────────────────────────────────

export interface PatientSearchResult {
  id: string;
  card: PatientCard;
}

export async function searchPatients(query: string): Promise<PatientSearchResult[]> {
  if (USE_MOCKS) {
    await delay(500);
    return [
      {
        id: "pat_1234567890ab",
        card: {
          name: "Pierre Muller",
          address: null,
          active_conditions: ["Urolithiasis — calculus 8mm"],
          current_treatments: ["Lithium (Téralithe 400) 400mg"],
          regular_followups: ["Dr. Laurent Muller"],
          upcoming_procedures: ["Ureteroscopy — 2026-04-24"],
          drug_interactions: ["Lithium × renal procedure"],
          last_updated: new Date().toISOString(),
        }
      }
    ].filter(p => p.card.name?.toLowerCase().includes(query.toLowerCase()) || p.id.toLowerCase().includes(query.toLowerCase()));
  }
  const response = await fetch(`/api/doctor/patients/search?query=${encodeURIComponent(query)}`, { headers: getAuthHeaders() });
  if (!response.ok) throw new Error("Failed to search patients");
  return response.json() as Promise<PatientSearchResult[]>;
}

export async function getPatientForDoctor(patientId: string): Promise<PatientCard> {
  if (USE_MOCKS) {
    await delay(300);
    return {
      name: "Pierre Muller",
      address: null,
      active_conditions: ["Urolithiasis — calculus 8mm"],
      current_treatments: ["Lithium (Téralithe 400) 400mg"],
      regular_followups: ["Dr. Laurent Muller"],
      upcoming_procedures: ["Ureteroscopy — 2026-04-24"],
      drug_interactions: ["Lithium × renal procedure"],
      last_updated: new Date().toISOString(),
    };
  }
  const response = await fetch(`/api/doctor/patients/${patientId}/card`, { headers: getAuthHeaders() });
  if (!response.ok) throw new Error("Failed to get patient card");
  return response.json() as Promise<PatientCard>;
}

export async function updatePatientCardForDoctor(patientId: string, card: PatientCard): Promise<PatientCard> {
  if (USE_MOCKS) {
    await delay(500);
    return card;
  }
  const response = await fetch(`/api/doctor/patients/${patientId}/card`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(card),
  });
  if (!response.ok) throw new Error("Failed to update patient card");
  return response.json() as Promise<PatientCard>;
}
