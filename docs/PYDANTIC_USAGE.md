# Usage guide

## Setup

Les dépendances sont gérées par [uv](https://docs.astral.sh/uv/).

### Installation de uv (si pas déjà installé)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Installer les dépendances

```bash
uv sync
```

Cela crée un virtualenv dans `.venv/` et installe toutes les dépendances depuis `uv.lock`.

Pour inclure les dépendances de dev (pytest) :

```bash
uv sync --dev
```

### Lancer le projet

```bash
uv run python main.py
```

Ou activer le virtualenv manuellement :

```bash
source .venv/bin/activate
python main.py
```

### Ajouter une dépendance

```bash
uv add <package>          # dépendance principale
uv add --dev <package>    # dépendance de dev
```

Créer un fichier `.env` à la racine (voir `.env.example`) :

```
MISTRAL_API_KEY=...
ELEVENLABS_API_KEY=...
```

---

## API publique

```python
from src import parse_document, parse_audio_note
```

| Fonction | Input | Output |
|---|---|---|
| `parse_document(path)` | Photo d'un document médecin (JPG, PNG, PDF…) | `MedicalDocument` |
| `parse_audio_note(path)` | Enregistrement vocal (MP3, WAV, M4A…) | `ClinicalNote` |

---

## Document médical → `MedicalDocument`

Le patient photographie le document reçu du médecin. La fonction détecte automatiquement le type.

```python
from src import parse_document

doc = parse_document("img/ordonnance_pierre.png")
print(doc.document_type)   # DocumentType.PRESCRIPTION
print(doc.patient_name)    # "Pierre MULLER"
```

### Modèle

```python
class DocumentType(str, Enum):
    PRESCRIPTION    = "prescription"
    OPERATION_REPORT = "operation_report"
    OTHER           = "other"

class Medication(BaseModel):
    name: str
    dosage: str | None           # ex. "500mg"
    frequency: str | None        # ex. "3 fois par jour"
    duration: str | None         # ex. "7 jours"
    route: str | None            # ex. "oral", "IV"
    instructions: str | None

class MedicalDocument(BaseModel):
    document_type: DocumentType

    # Champs communs
    patient_name: str | None
    doctor_name: str | None
    doctor_id: str | None        # ex. numéro RPPS
    date: str | None             # ISO 8601 si déterminable

    # Champs ordonnance
    medications: list[Medication]

    # Champs compte rendu
    procedure: str | None
    diagnosis: str | None
    operative_findings: str | None
    post_op_instructions: list[str]
    follow_up: str | None

    notes: str | None
```

### Résultat attendu — `img/IMG_3347.png` (ordonnance Amoxicilline)

```python
MedicalDocument(
    document_type=DocumentType.PRESCRIPTION,
    patient_name="Pierre MULLER",
    doctor_name="Laurent MULLER",
    doctor_id=None,
    date="2026-01-25",
    medications=[
        Medication(
            name="Amoxicilline",
            dosage="2g (première dose), puis 1g",
            frequency="matin, midi, soir",
            duration="7 jours",
            route=None,
            instructions="2g pour la première dose, puis 1g matin/midi/soir",
        )
    ],
    procedure=None,
    diagnosis=None,
    operative_findings=None,
    post_op_instructions=[],
    follow_up=None,
    notes=None,
)
```

### Résultat attendu — `img/ordonnance_pierre.png` (ordonnance kiné)

```python
MedicalDocument(
    document_type=DocumentType.PRESCRIPTION,
    patient_name="Pierre MULLER",
    doctor_name="Laurent MULLER",
    doctor_id=None,
    date="2026-02-17",
    medications=[
        Medication(
            name="Kinésithérapie",
            dosage=None,
            frequency=None,
            duration="15 séances",
            route=None,
            instructions="Tendinite sus rotulienne par le tricule",
        )
    ],
    procedure=None,
    diagnosis=None,
    operative_findings=None,
    post_op_instructions=[],
    follow_up=None,
    notes=None,
)
```

---

## Enregistrement vocal → `ClinicalNote`

```python
from src import parse_audio_note

note = parse_audio_note("recordings/dictee.mp3")
print(note.chief_complaint)
print(note.action_items)
```

### Modèle

```python
class ClinicalNote(BaseModel):
    patient_name: str | None
    practitioner: str | None
    date: str | None
    chief_complaint: str | None      # motif principal
    observations: str | None         # examen clinique, symptômes
    action_items: list[str]          # prescriptions, examens, orientations
    follow_up: str | None
```

---

## Accès aux champs et sérialisation

```python
doc = parse_document("img/IMG_3347.png")

# Accès typé
for med in doc.medications:
    print(med.name, med.dosage, med.duration)

# Branchement sur le type
match doc.document_type:
    case DocumentType.PRESCRIPTION:
        print("Médicaments :", doc.medications)
    case DocumentType.OPERATION_REPORT:
        print("Intervention :", doc.procedure)

# JSON
print(doc.model_dump_json(indent=2))

# Dict Python
data = doc.model_dump()
```

---

## Keyterms audio (personnalisation)

Pour améliorer la reconnaissance sur un vocabulaire spécifique, passer une liste de termes :

```python
from src.parsers import AudioParser
from src.extractor import Extractor
from mistralai import Mistral
import os

parser = AudioParser(
    api_key=os.environ["ELEVENLABS_API_KEY"],
    keyterms=["Amoxicilline", "kinésithérapie", "tendinite", "rotulien"],
)
transcript = parser.transcribe("recordings/dictee.mp3")

extractor = Extractor(Mistral(api_key=os.environ["MISTRAL_API_KEY"]))
note = extractor.extract_clinical_note(transcript)
```
