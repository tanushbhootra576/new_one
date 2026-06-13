# Arwen — The agent that turns your discharge instructions into actions

## The problem

Every day, thousands of patients leave consultations or hospitals with instructions they barely understand, quickly forget, or don't know how to follow through on. The result: missed exams, appointments never booked, avoidable complications, and doctors wasting time piecing together patient history.

## The solution

An AI agent that handles the entire patient journey **from discharge to the next appointment**:
1. It understands discharge instructions
2. It turns them into concrete actions and executes them
3. It follows up with the patient over time
4. It prepares the next practitioner

**Patient health data never leaves the device. Zero-knowledge by design.**

---

## Product architecture

```
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │   INPUTS                                            │
  │                                                     │
  │   📄 Medical documents                              │
  │   • Post-op reports                                 │
  │   • Discharge instructions                          │
  │   • Prescriptions & referrals                       │
  │                                                     │
  │   🎙️ Patient audio note                             │
  │   • Records additional context the doctor           │
  │     mentioned verbally but didn't write down        │
  │   • "The doctor told me to avoid ibuprofen          │
  │     and to call if I get a fever above 38.5"        │
  │   • Transcribed via speech-to-text (Mistral/        │
  │     ElevenLabs) and merged with document data       │
  │                                                     │
  └────────────────────┬────────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │   Agent — Parsing (Mistral)                         │
  │   Cross-references documents + audio to build       │
  │   a complete picture. Identifies:           │
  │   • Tests to be performed                           │
  │   • Constraints (rest, mobility, diet)              │
  │   • Treatments and interactions                     │
  │   • Appointments to schedule                        │
  │   • Warning signs to monitor                        │
  │                                                     │
  └────────────────────┬────────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │   Extraction of concrete actions                    │
  │   The agent breaks down each instruction into       │
  │   executable, prioritized tasks with deadlines      │
  │                                                     │
  └────────────────────┬────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ PILLAR 1 │  │ PILLAR 2 │  │ PILLAR 3 │
  │ Immediate│  │ Active   │  │ Next     │
  │ actions  │  │ follow-  │  │ appoint- │
  │          │  │ up       │  │ ment     │
  │          │  │          │  │ prep     │
  └──────────┘  └──────────┘  └──────────┘
```

---

## The 3 pillars

### Pillar 1 — Immediate actions (Day 0)

The patient leaves, the agent acts.

| Identified instruction | Action executed by the agent |
|---|---|
| "Urine culture to be done before surgery" | Finds nearby labs, suggests time slots, adds to calendar |
| "Urea/creatinine blood test" | Same — grouped at the same lab when possible |
| "Strict rest, no weight-bearing" | Detects reduced mobility → offers to book a taxi/medical transport |
| "No heavy lifting for 48h" | Adds a calendar reminder with end-of-restriction date |
| "Painkiller prescription" | Nearest pharmacy (or on-call pharmacy if evening/weekend) |

**The patient validates every action before execution.** The agent suggests, the patient decides.

---

### Pillar 2 — Active follow-up (D+1 → next appointment)

The agent doesn't disappear after discharge. It follows up.

**Scheduled voice check-ins:**
- **D+1**: "How are you feeling? Pain level out of 10? Any fever?" → if abnormal response, the agent advises calling the doctor or emergency services
- **D+3**: "Have you done your blood test yet?" → if not, nudges and re-suggests a time slot
- **D-1 before appointment**: "Tomorrow you're seeing Dr. Petit. Don't forget to bring your results. Here are the questions you wanted to ask."

**Smart reminders:**
- Medication reminders
- Restriction reminders (return to exercise, diet)
- Exam reminders with deadlines

**Anomaly detection:**
- Cross-referencing with Thryve data (sleep, activity, heart rate)
- If significant deviation → alerts the patient → suggests action

---

### Pillar 3 — Patient card and next appointment prep

The next practitioner receives a **prepared** patient, not one who says "uh, I don't remember what they did to me".

**The patient identity card:**

```
┌───────────────────────────────────────────────────────┐
│                                                       │
│  PATIENT CARD — John Doe, 42 years old                │
│                                                       │
│  Active conditions                                    │
│  • Bipolar disorder (diag. 2019)                      │
│  • Recurrent urinary lithiasis                        │
│                                                       │
│  Current treatments                                   │
│  • Lithium 400mg x2/day (since 2019)                  │
│  • Tamsulosin 0.4mg/day                               │
│                                                       │
│  Regular follow-up                                    │
│  • Psychiatrist — Dr. Martin,                         │
│    Pitie-Salpetriere Hospital → every 5 days          │
│  • Urologist — Dr. Petit, Tenon Hospital — 1x/month  │
│                                                       │
│  Last consultation / hospitalization                  │
│  • 04/08/2026 — Ureteroscopy (Tenon)                  │
│  • Instructions: pre-op urine culture,                │
│    urea/creatinine check, 48h rest                    │
│                                                       │
│  Drug interactions to watch                           │
│  • Lithium + NSAIDs → renal toxicity risk             │
│  • Monitor lithium levels if dehydrated               │
│                                                       │
│  Patient questions for this appointment               │
│  • "Can lithium affect my kidney test results?"       │
│  • "Should I adjust my dose before the ureteroscopy?" │
│                                                       │
└───────────────────────────────────────────────────────┘
```

**The card gets richer with every consultation.** The agent updates it automatically from new medical reports. The patient can also add their own notes and questions over time.

**The practitioner summary** is auto-generated and can be:
- Shared via QR code in the waiting room
- Sent via secure email
- Printed by the patient

---

## Technical architecture

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  PATIENT DEVICE (edge)                                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │  LOCAL VAULT (encrypted, zero-knowledge)               │  │
│  │                                                        │  │
│  │  • Patient card                                        │  │
│  │  • Medical reports & discharge instructions            │  │
│  │  • Check-in history                                    │  │
│  │  • Health data (Thryve)                                │  │
│  │  • Patient notes & questions                           │  │
│  │                                                        │  │
│  │  → AES-256 encryption at rest                          │  │
│  │  → Key derived from patient only                       │  │
│  │  → No data stored server-side                          │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │  AGENT (Mistral)                                       │  │
│  │                                                        │  │
│  │  • Reasons over sensitive data locally                 │  │
│  │  • Extracts actions to execute                         │  │
│  │  • Anonymizes before any external call                 │  │
│  │  • Updates the patient card                            │  │
│  │                                                        │  │
│  └───────────────────────┬────────────────────────────────┘  │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           │  Only ACTIONS leave the device
                           │  Never patient data
                           │
              ┌────────────┼────────────┬──────────────┐
              ▼            ▼            ▼              ▼
       ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐
       │ Google    │ │ Eleven   │ │ Thryve   │ │ Lab /     │
       │ Calendar  │ │ Labs     │ │          │ │ taxi      │
       │           │ │          │ │          │ │ search    │
       │ Reminders │ │ Voice    │ │ Activity │ │           │
       │ & appoint-│ │ check-ins│ │ & sleep  │ │ Geoloc &  │
       │ ments     │ │ & briefs │ │ data     │ │ booking   │
       └───────────┘ └──────────┘ └──────────┘ └───────────┘
```

### Core principle: data stays, only actions leave

| What stays in the vault | What goes to external APIs |
|---|---|
| "Bipolar patient on lithium" | "Book a taxi at 2pm, 25 rue de Tolbiac 75013" |
| Full medical report | "Lab that does urine cultures near 75013" |
| Symptom history | "Create calendar event 04/18 at 9am: Lab" |
| Patient card | Anonymized text for voice synthesis |

---

## Tech stack

| Component | Technology | Role |
|---|---|---|
| Report parsing + reasoning + orchestration | **Mistral** | Understands French medical jargon, plans actions, updates patient card |
| Voice check-ins + pre-appointment audio briefing | **ElevenLabs** | Natural voice for follow-up and preparation |
| Connected health data | **Thryve** | Sleep, activity, heart rate to contextualize follow-up |
| Encrypted local vault | **SQLCipher / Fernet** | Encrypted storage at rest, zero-knowledge |
| Calendar and reminders | **Google Calendar API** | Native integration for appointments and reminders |
| Lab / pharmacy search | **Google Maps API** | Geolocation of nearby health services |

---

## Demo scenario (5 min)

**Context**: Patient leaves after a urology consultation. Report: ureteroscopy scheduled, urine culture required before D-7, urea/creatinine check, 48h rest, no heavy lifting.

**Act 1 — Discharge (Pillar 1)**
> The agent parses the report live. Displays: "I've identified 4 actions to take."
> - "I found 3 labs near you for the urine culture and blood test. Which one do you prefer?"
> - "You can't walk right now. Shall I book you a taxi?"
> - Patient validates → lab appointment added to calendar, taxi booked.

**Act 2 — Follow-up (Pillar 2)**
> We simulate D+2. The agent calls via voice:
> "Hi John, this is your Arwen assistant. How are you feeling today? Any fever?"
> Patient responds → the agent reassures or escalates based on the answer.
> "Don't forget, your urine culture is in 3 days."

**Act 3 — Appointment prep (Pillar 3)**
> We simulate D-1 before the urologist appointment.
> The agent generates the updated patient card with integrated test results.
> Voice briefing: "Tomorrow you're seeing Dr. Petit. Here are the 2 questions you wanted to ask."
> The patient scans a QR code → the practitioner sees the card in 30 seconds.

---

## Why it's different

- **It's not a health chatbot** — it's an agent that executes concrete actions
- **It's not a better PDF** — it's a companion that follows up over time
- **It's not a health cloud** — data stays on-device, zero-knowledge
- **It's not a tool for doctors** — it's a tool for patients that also benefits doctors
