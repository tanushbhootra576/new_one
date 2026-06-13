# Implementation Plan

## Overview

An AI agent (Mistral) that receives structured medical data from `src/extractor/` — specifically `MedicalDocument` and `ClinicalNote` Pydantic models — produces an action plan, executes it after patient validation, and maintains a persistent patient history.

**2-pass architecture**: reasoning first, execution second. Patient validates everything in batch between the two passes.

---

## Architecture: 2 passes + historization

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  INPUT (from src/extractor/)                                    │
│  • documents: list[MedicalDocument]                             │
│      (document_type: prescription | operation_report | other)   │
│  • clinical_note: ClinicalNote | None  (structured audio note)  │
│  • patient_context: PatientContext  (from vault, not extractor) │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  PASS 1 — Reasoning (no side effects)                           │
│                                                                 │
│  Mistral receives:                                              │
│  • Current input (parsed docs + audio)                          │
│  • Patient history from vault (if returning patient)            │
│                                                                 │
│  Mistral produces:                                              │
│  • ActionPlan (prioritized, typed actions with deadlines)       │
│  • Questions for upcoming appointments                          │
│  • Alerts (drug interactions, implicit needs)                   │
│  • Patient card updates                                         │
│                                                                 │
│  Key reasoning:                                                 │
│  • Current treatments x new prescriptions → interactions        │
│  • Constraints x grouping → logistics optimization              │
│  • Instructions x patient context → implicit deductions         │
│  • History x future → relevant questions                        │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  BATCH VALIDATION                                               │
│                                                                 │
│  Patient sees the full plan at once:                            │
│  • All actions listed with priority, deadline, reasoning        │
│  • Can accept, reject, or modify any action                     │
│  • Can add notes or questions                                   │
│  • Single validation step, not one-by-one                       │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  PASS 2 — Execution (side effects)                              │
│                                                                 │
│  For each validated action, Mistral calls the right tool:       │
│  • search_nearby_labs(exam_type, zip_code)                      │
│  • create_calendar_event(title, date, location, reminder)       │
│  • book_transport(address, datetime, mobility_needs)            │
│  • send_reminder(message, datetime, channel)                    │
│                                                                 │
│  After execution:                                               │
│  • Each action status updated in vault (DONE/SKIPPED)           │
│  • Patient card updated with new info                           │
│  • Timeline enriched                                            │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  VAULT (encrypted local storage)                                │
│                                                                 │
│  Persists everything for follow-up and future consultations     │
│  (see Historization section below)                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pass 1 — Reasoning (the core)

### Input

```python
from extractor.models import MedicalDocument, ClinicalNote

class PatientInput(BaseModel):
    documents: list[MedicalDocument]     # prescriptions + operation reports + other
    clinical_note: ClinicalNote | None    # structured transcript of the practitioner's voice note
    patient_context: PatientContext       # coming from the vault (PatientCard), NOT from extractor
```

Notes on how to consume this input:
- Prescriptions are accessed via `[d for d in documents if d.document_type == DocumentType.PRESCRIPTION]`, then `d.medications` (each is a `Medication` with `name`, `dosage`, `frequency`, `duration`, `route`, `instructions`).
- Discharge / post-op instructions are accessed via `[d for d in documents if d.document_type == DocumentType.OPERATION_REPORT]`, then `d.post_op_instructions`, plus `d.procedure`, `d.diagnosis`, `d.operative_findings`, `d.follow_up`.
- The practitioner's voice note is **not a raw transcript** anymore: `ClinicalNote` is already structured with `chief_complaint`, `observations`, `action_items: list[str]`, and `follow_up`. The `action_items` field is effectively a pre-parsed list of actions the agent must decompose further.
- Most fields on `MedicalDocument` and `ClinicalNote` are optional (`| None`) — the agent must handle missing data gracefully.

### What the agent does

Mistral receives the full patient context + history from vault (if any) with a system prompt:

> "You are a post-consultation planning agent. You receive a list of `MedicalDocument` objects (prescriptions and operation reports) plus an optional structured `ClinicalNote` from the practitioner's voice note. From this data, produce a structured action plan. Decompose each discharge instruction and each `clinical_note.action_items` entry into atomic actions. Identify dependencies between actions. Detect cross-constraints (drug interactions, exam grouping). Generate relevant questions for upcoming appointments."

### Output (Mistral JSON mode)

```
ActionPlan:
  actions:
    - type: BOOK_LAB
      title: "Urine culture (ECBU)"
      why: "Prescribed before ureteroscopy on 04/20"
      deadline: "2026-04-13"            # D-7 calculated by agent
      constraints: ["fasting: no", "results within 48h"]
      depends_on: []
      priority: HIGH
      group_with: null

    - type: BOOK_LAB
      title: "Urea/creatinine check"
      why: "Pre-operative blood work"
      deadline: "2026-04-13"
      constraints: ["fasting: yes"]
      depends_on: []
      priority: HIGH
      group_with: "Urine culture (ECBU)"   # Agent detected grouping

    - type: BOOK_TRANSPORT
      title: "Taxi home"
      why: "Strict rest, no weight-bearing detected in instructions"
      deadline: "2026-04-11"            # Today
      constraints: ["reduced mobility"]
      priority: URGENT

    - type: ADD_REMINDER
      title: "End of heavy lifting restriction"
      why: "No heavy lifting for 48h"
      deadline: "2026-04-13"
      constraints: []
      priority: MEDIUM

  questions_for_next_appointments:
    - appointment: "Ureteroscopy — Dr. Petit — 04/20"
      questions:
        - "Can lithium affect my kidney test results?"
        - "Should I adjust my lithium dosage before the procedure?"
        - "What are the post-operative warning signs to watch for?"
      reasoning: "Patient on lithium → possible renal interaction.
                  Agent cross-referenced current treatment with planned procedure."

  alerts:
    - "Interaction detected: Lithium + renal procedure.
       Recommendation: mention lithium to the urologist."

  patient_card_updates:
    - field: "last_consultation"
      value: "04/08/2026 — Urology consultation, Tenon Hospital"
    - field: "upcoming_procedures"
      value: "Ureteroscopy planned 04/20/2026"
    - field: "active_prescriptions"
      add: ["Pre-op urine culture", "Urea/creatinine check"]
```

### Cross-reasoning — where the value is

The agent doesn't just do "instruction → action". It cross-references:

1. **Current treatments x new prescriptions** → interaction detection
   - Cross `patient_context.current_treatments` with `document.medications[*].name` for documents of type `PRESCRIPTION`.
   - "You're on lithium, your urologist needs to know — renal impact"

2. **Constraints x grouping** → logistics optimization
   - "Urine culture and urea/creatinine can be done at the same lab, same day"

3. **Instructions x patient context** → implicit deductions
   - Combine `document.post_op_instructions` (operation reports) with `clinical_note.action_items` and `patient_context`.
   - "Strict rest" + "patient lives alone on 5th floor, no elevator" → suggest transport

4. **History x future** → relevant questions
   - Agent knows patient has psychiatric follow-up → "Should lithium be adjusted before anesthesia?"

---

## Pass 2 — Execution

After the patient validates the full plan in batch, the agent executes each accepted action via Mistral function calling:

```
Patient validates plan (batch)
    │
    ▼
For each accepted action:
    │
    ├── BOOK_LAB → search_nearby_labs("ECBU", "75013")
    │              → present results to patient
    │              → create_calendar_event(...)
    │              → update vault: action status = DONE
    │
    ├── BOOK_TRANSPORT → book_transport("25 rue Tolbiac", "14:00", "reduced mobility")
    │                   → update vault: action status = DONE
    │
    ├── ADD_REMINDER → create_calendar_event("End of restriction", "04/13", reminder=true)
    │                → update vault: action status = DONE
    │
    └── SKIPPED actions → update vault: action status = SKIPPED
    
    ▼
Patient card updated with all new info
Timeline enriched with all events
```

### Tools (Mistral function calling)

- `search_nearby_labs(exam_type, zip_code)` → Google Maps API / lab directory
- `create_calendar_event(title, date, time, location, reminder)` → Google Calendar API
- `book_transport(address, datetime, mobility_needs)` → taxi API or mock
- `send_reminder(message, datetime, channel)` → notification/SMS

---

## Historization — Patient memory

### Why it matters

Without historization, the agent is amnesic:
- Can't follow up at D+3: "Have you done your urine culture yet?"
- Can't remember treatments when the patient comes back months later
- Can't enrich the patient card across consultations
- Can't contextualize a new plan with history

### What we persist

```
PatientHistory (encrypted local vault)
│
├── patient_card: PatientCard              # Patient identity card (evolves)
│   ├── identity (name, age, address)
│   ├── active_conditions                  # Active conditions
│   ├── current_treatments                 # Current treatments
│   ├── regular_followups                  # Doctors and frequency
│   ├── drug_interactions                  # Known interactions
│   └── last_updated
│
├── consultations: list[Consultation]      # Consultation history
│   └── Consultation
│       ├── date
│       ├── practitioner
│       ├── documents: list[MedicalDocument]   # prescriptions + operation reports + other
│       ├── clinical_note: ClinicalNote | None # structured practitioner voice note
│       └── source_files: list[str]            # original OCR/audio file paths
│
├── action_plans: list[ActionPlan]         # Action plan history
│   └── ActionPlan
│       ├── created_at
│       ├── consultation_ref               # Link to consultation
│       ├── actions: list[Action]          # Each action with status
│       │   └── status: PENDING | DONE | SKIPPED | OVERDUE
│       └── questions_generated
│
├── check_ins: list[CheckIn]              # Voice check-in history
│   └── CheckIn
│       ├── date
│       ├── responses (pain, fever, etc.)
│       └── alert_triggered: bool
│
└── timeline: list[Event]                 # Unified chronological view
    └── Event
        ├── date
        ├── type: CONSULTATION | ACTION_DONE | CHECK_IN | REMINDER | ALERT
        └── summary
```

### How it integrates with the 2 passes

```
Pass 1 (reasoning)
    │
    │  Agent also receives patient history from vault
    │  → "I see you've been on lithium since 2019"
    │  → "Your last urine culture was on 01/15, results normal"
    │  → Better reasoning, better questions
    │
    ▼
Batch validation by patient
    │
    ▼
Pass 2 (execution)
    │
    │  Each executed action updates the vault:
    │  → Action DONE → status updated in plan
    │  → New appointment → added to timeline
    │  → Patient card → enriched with new info
    │
    ▼
Follow-up (D+1, D+3, ...)
    │
    │  Agent queries vault to know:
    │  → Which actions are still PENDING?
    │  → Which check-ins are scheduled?
    │  → Are there OVERDUE actions to escalate?
    │
    ▼
Next consultation
    │
    │  Full history feeds the patient card
    │  and questions for the next practitioner
```

### Vault implementation

- Storage: Fernet-encrypted JSON file per patient
- Interface: `PatientRepository` (hexagonal port) with:
  - `save_consultation(consultation)`
  - `save_action_plan(plan)`
  - `update_action_status(action_id, status)`
  - `save_check_in(check_in)`
  - `get_patient_card() -> PatientCard`
  - `get_history() -> PatientHistory`
  - `get_pending_actions() -> list[Action]`
- Hackathon: local JSON adapter. Production: swap to SQLCipher or other

---

## Hexagonal architecture — Project structure

```
agent/                              # Isolated subdirectory
├── pyproject.toml                  # uv project config
├── Makefile                        # Dev commands (lint, run, test)
├── src/
│   └── agent/
│       ├── __init__.py
│       ├── domain/                 # Core business logic (no dependencies)
│       │   ├── models/
│       │   │   ├── patient.py      # PatientInput, PatientContext
│       │   │   │                   # (PatientInput wraps extractor's
│       │   │   │                   #  MedicalDocument + ClinicalNote)
│       │   │   ├── actions.py      # ActionPlan, Action, ActionType
│       │   │   ├── patient_card.py # PatientCard
│       │   │   └── history.py      # PatientHistory, Consultation, CheckIn, Event
│       │   └── ports/
│       │       ├── planner.py      # PlannerPort (interface for the agent)
│       │       ├── repository.py   # PatientRepository (interface for vault)
│       │       ├── calendar.py     # CalendarPort
│       │       ├── lab_finder.py   # LabFinderPort
│       │       └── transport.py    # TransportPort
│       ├── adapters/               # Implementations (external dependencies)
│       │   ├── mistral_planner.py  # Mistral SDK implementation of PlannerPort
│       │   ├── json_repository.py  # Fernet-encrypted JSON implementation
│       │   ├── google_calendar.py  # Google Calendar API adapter
│       │   ├── google_maps_labs.py # Google Maps lab search adapter
│       │   ├── mock_transport.py   # Mock taxi adapter for hackathon
│       │   └── elevenlabs_voice.py # ElevenLabs TTS adapter
│       ├── app/                    # Application layer (orchestration)
│       │   ├── plan_service.py     # Orchestrates pass 1 + pass 2
│       │   └── followup_service.py # Manages check-ins and reminders
│       └── api/                    # Entry points
│           ├── main.py             # FastAPI app (serves /api/* to the front)
│           └── cli.py              # CLI for hackathon demo
├── tests/
│   └── ...
├── fixtures/
│   └── urologie_case.json          # Realistic test case
└── web/                            # Mini front (Vite + React + Tailwind)
    ├── package.json
    ├── vite.config.ts              # Dev proxy: /api → FastAPI (http://localhost:8000)
    ├── tailwind.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx                 # Router: Upload → Review → Plan → Execution → Card
        ├── api/
        │   └── client.ts           # Typed fetch wrappers (/api/upload, /api/plan, ...)
        ├── types/
        │   └── models.ts           # TS types mirroring MedicalDocument / ClinicalNote / ActionPlan
        ├── pages/
        │   ├── UploadPage.tsx      # Drop zone for photos + audio
        │   ├── ReviewPage.tsx      # Show extracted MedicalDocument / ClinicalNote (read-only)
        │   ├── PlanPage.tsx        # Batch validation (accept/reject/edit per action)
        │   ├── ExecutionPage.tsx   # Pass 2 results (what was booked/scheduled)
        │   └── PatientCardPage.tsx # Current PatientCard + pending actions
        └── components/
            ├── FileDropzone.tsx
            ├── DocumentCard.tsx    # Renders a MedicalDocument
            ├── ClinicalNoteCard.tsx
            ├── ActionRow.tsx       # Accept / Reject / Modify controls
            └── AlertBanner.tsx
```

### Key boundaries

- **domain/** has zero external dependencies — pure Python + Pydantic. It does **not** redefine `MedicalDocument`, `Medication`, or `ClinicalNote`: those are imported directly from `extractor.models` (the input team's package). Only `PatientContext` is defined agent-side because it comes from the vault, not the extractor.
- **ports/** define interfaces (abstract classes) for what the domain needs
- **adapters/** implement those interfaces with real external services
- **app/** wires everything together and orchestrates the 2-pass flow
- **Coupling note**: the agent depends on `src/extractor/` for its input types. This coupling is intentional — it is the team contract. If the extractor schema changes, the agent must be updated.

---

## Tech stack

| Component | Technology | Why |
|---|---|---|
| Project management | **uv** | Fast Python project manager |
| Front-end | **Vite + React + Tailwind (+ shadcn/ui)** | Mini web UI for upload, plan validation, and patient card |
| Input parsing | **`src/extractor/`** (Mistral OCR + transcription) | Produces `MedicalDocument` and `ClinicalNote` consumed by the agent |
| Data models | **Pydantic** | Shared contract with input team |
| LLM | **Mistral SDK** (native function calling) | No framework overhead |
| API | **FastAPI** | Quick to set up, Pydantic-native |
| Linting | **ruff** | Fast, all-in-one Python linter |
| Vault | **cryptography (Fernet)** | Simple symmetric encryption |
| Calendar | **Google Calendar API** | Native integration |
| Voice | **ElevenLabs** | Natural TTS for check-ins |
| Health data | **Thryve** | Sleep, activity, heart rate |

---

## API endpoints

All endpoints are prefixed with `/api` so the Vite dev server can proxy them transparently during development.

```
POST /api/upload
  Input: multipart/form-data
    - files: one or more images (jpg/png/pdf) — prescriptions, op reports
    - audio: optional audio file (mp3/wav/webm) — practitioner voice note
  Behavior:
    - Each image is OCR'd then passed to Extractor.extract_document()
    - Audio is transcribed then passed to Extractor.extract_clinical_note()
  Output: {
    "documents": [ MedicalDocument, ... ],
    "clinical_note": ClinicalNote | null,
    "upload_id": str                       # reference used by /api/plan
  }

POST /api/plan
  Input: {
    "upload_id": str,                      # from /api/upload
    "patient_context": PatientContext      # loaded from vault by patient_id
  }
  Output: ActionPlan (pass 1 result)

POST /api/execute
  Input: ValidatedPlan (plan with patient accept/reject/edits per action)
  Output: ExecutionResult (what was done, updated patient card)

GET /api/patient/{id}/card
  Output: PatientCard

GET /api/patient/{id}/pending-actions
  Output: list[Action] where status == PENDING or OVERDUE

POST /api/patient/{id}/check-in        # OUT OF SCOPE for hackathon demo (see Front-end flow)
  Input: CheckInResponse (pain level, fever, notes)
  Output: CheckInResult (reassurance or escalation)
```

---

## Front-end flow (mini web UI)

The front is a single-page React app (Vite + Tailwind + shadcn/ui) that walks the patient through the full journey after a consultation. It is the only way the patient interacts with the agent for the demo — voice check-ins are **out of scope** for now.

### User journey

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌───────────────┐
│  1. Upload   │ ──▶ │  2. Review   │ ──▶ │   3. Plan    │ ──▶ │  4. Execution   │ ──▶ │ 5. Patient    │
│  photos +    │     │  extracted   │     │  (batch      │     │  (Pass 2 runs   │     │ card +        │
│  audio       │     │  data        │     │   validation)│     │  tool calls)    │     │ timeline      │
└──────────────┘     └──────────────┘     └──────────────┘     └─────────────────┘     └───────────────┘
      │                    │                    │                      │                      │
      ▼                    ▼                    ▼                      ▼                      ▼
 POST /api/upload    (client only —       POST /api/plan          POST /api/execute       GET /api/patient/
 (OCR + transcribe   render the JSON      (Pass 1 runs)           (uses ValidatedPlan     {id}/card
  via extractor)     returned at step 1)                           from step 3)           + /pending-actions
```

### Page-by-page

1. **`UploadPage`** — drop zone accepting multiple images (prescriptions, op reports) and one optional audio file. On submit, calls `POST /api/upload`. Shows a loader while OCR + transcription run (can take several seconds — display per-file progress if possible). The response (`documents`, `clinical_note`, `upload_id`) is pushed into the app state and the user is routed to `ReviewPage`.

2. **`ReviewPage`** — read-only rendering of what the extractor produced, so the patient can confirm nothing obvious is wrong before burning an LLM call:
   - One `DocumentCard` per `MedicalDocument`, with a visual distinction for `document_type` (prescription vs operation_report vs other). Shows `patient_name`, `doctor_name`, `date`, medications list, post-op instructions, etc.
   - One `ClinicalNoteCard` for the `ClinicalNote` if present (`chief_complaint`, `observations`, `action_items`).
   - A single "Generate plan" button calls `POST /api/plan` and routes to `PlanPage`.

3. **`PlanPage`** — the **batch validation** step, which is the core interaction. Displays the `ActionPlan` returned by Pass 1:
   - Alerts at the top (`AlertBanner`) — e.g. drug interaction warnings.
   - Actions grouped by priority (URGENT → HIGH → MEDIUM → LOW), each rendered as an `ActionRow` with:
     - Title, why, deadline, constraints, priority badge.
     - Three controls: **Accept** (default), **Reject**, **Modify** (opens a small inline editor to change title/deadline/notes).
     - A visual marker when an action is part of a `group_with` cluster (so the patient understands grouping decisions).
   - Questions for upcoming appointments shown as a separate section (informational only, not validated).
   - A single "Execute plan" button at the bottom calls `POST /api/execute` with a `ValidatedPlan = { actions: [{id, decision: ACCEPT|REJECT|MODIFIED, overrides?}] }`.

4. **`ExecutionPage`** — shows the result of Pass 2: per action, what tool was called and whether it succeeded (booked lab, created calendar event, etc.). Failed actions are highlighted with a retry button. A "Done" button routes to `PatientCardPage`.

5. **`PatientCardPage`** — dashboard view of the persisted vault state:
   - Current `PatientCard` (identity, active conditions, current treatments, upcoming procedures).
   - Timeline of recent events.
   - Pending/overdue actions from `/api/patient/{id}/pending-actions`.

### Client/server contract

- TS types in `web/src/types/models.ts` mirror the Pydantic schemas **1:1**. They can be auto-generated at build time from `MedicalDocument.model_json_schema()` + `ActionPlan.model_json_schema()` using `datamodel-code-generator` or `openapi-typescript` (FastAPI exposes the full OpenAPI spec at `/openapi.json`). Prefer auto-generation to hand-written types to stay in sync with the extractor.
- The front **never** instantiates `MedicalDocument` or `ActionPlan` itself — it only reads them from API responses and posts back either an `upload_id` or a `ValidatedPlan`.
- Dev setup: `vite.config.ts` proxies `/api` to `http://localhost:8000` so `npm run dev` + `uvicorn agent.api.main:app --reload` run side by side with no CORS headache.

### Out of scope for the front (v1)

- Voice check-ins (ElevenLabs TTS) — deferred.
- Auth / multi-patient — single hardcoded `patient_id` for the demo.
- Real-time updates for D+3 follow-ups — polling `/api/patient/{id}/pending-actions` is enough.

---

## Verification

1. Create a JSON fixture simulating the extractor's output (realistic urology case): a `list[MedicalDocument]` containing at least one `PRESCRIPTION` and one `OPERATION_REPORT`, plus a `ClinicalNote`. The fixture must validate against the schemas in `src/extractor/models/`.
2. Run pass 1 → verify the plan contains the right actions with correct types
3. Verify the agent correctly handles the `document_type` discriminant and the many optional (`| None`) fields on `MedicalDocument` / `ClinicalNote`
4. Verify that ECBU + urea/creatinine grouping is detected
5. Verify that the lithium alert is generated
6. Simulate patient validation → run pass 2 → verify tool calls
7. Verify that the patient card is updated in the vault
8. Simulate D+3 → verify that pending actions are flagged
