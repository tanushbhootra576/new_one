from pathlib import Path

import httpx

ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"
STT_MODEL = "scribe_v2"

# Medical keyterms injected by default to improve recognition accuracy.
# Extend this list with domain-specific drug names and procedure names as needed.
DEFAULT_MEDICAL_KEYTERMS: list[str] = [
    "prescription",
    "dosage",
    "tablet",
    "capsule",
    "infusion",
    "surgery",
    "anesthesia",
    "suture",
    "CT scan",
    "MRI",
    "ultrasound",
    "biopsy",
    "antibiotic therapy",
    "corticosteroid",
    "anticoagulant",
]


class AudioParser:
    """Transcribes voice recordings via the ElevenLabs Speech-to-Text API."""

    def __init__(self, api_key: str, keyterms: list[str] | None = None) -> None:
        self._api_key = api_key
        self._keyterms = keyterms if keyterms is not None else DEFAULT_MEDICAL_KEYTERMS

    def transcribe(self, file_path: str | Path) -> str:
        """
        Send an audio file to ElevenLabs and return the plain text transcript.

        Supported formats: WAV, MP3, M4A (and other formats accepted by scribe_v2).
        """
        path = Path(file_path)

        with open(path, "rb") as f:
            audio_bytes = f.read()

        # keyterms are passed as repeated form fields
        multipart: list = [("model_id", (None, STT_MODEL))]
        multipart.append(("file", (path.name, audio_bytes)))
        for term in self._keyterms:
            multipart.append(("keyterms", (None, term)))

        response = httpx.post(
            ELEVENLABS_STT_URL,
            headers={"xi-api-key": self._api_key},
            files=multipart,
            timeout=120,
        )
        response.raise_for_status()

        return response.json()["text"]
