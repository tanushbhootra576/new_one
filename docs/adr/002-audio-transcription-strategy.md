# ADR 002: Audio Transcription Strategy

**Date:** 2026-04-11
**Status:** Accepted
**Deciders:** Team

---

## Context

The application accepts voice recordings as input (format TBD — likely WAV, MP3, or M4A). These recordings may contain medical dictation: symptoms, post-op observations, or patient history narrated by a practitioner.

**The Mistral API does not offer a speech-to-text (STT) endpoint.** This ADR concerns the transcription step only. Once a text transcript is produced, it is fed into the Mistral chat API for structured extraction (same pipeline as documents).

Two external vendors are authorized for this step: **ElevenLabs** and **Nebius**.

The transcribed text must be accurate enough to extract structured data. Medical vocabulary (drug names, anatomical terms, procedure names) increases the risk of transcription errors with generic models.

---

## Options considered

### Option A: ElevenLabs Speech-to-Text API (`scribe_v2`)

Audio is sent to the ElevenLabs `/v1/speech-to-text` endpoint using model `scribe_v2`. Returns a transcript with optional word-level timestamps, speaker diarization, and keyterm biasing.

| | |
|---|---|
| Pros | **Keyterm biasing** allows injecting a list of medical terms (drug names, procedures) to improve recognition accuracy. PHI/PII entity detection built-in. Simple REST call, supports file upload or URL. Synchronous and async modes. |
| Cons | Audio data sent to ElevenLabs — data residency depends on their DPA. Per-minute billing with surcharges for entity detection (+30%) and keyterm biasing (+20%). Second vendor dependency. |
| Complexity | Low |

---

### Option B: Whisper hosted on Nebius GPU inference

Nebius provides serverless GPU infrastructure and OpenAI-compatible inference endpoints. A Whisper model (e.g. `large-v3`) is deployed or accessed via Nebius's inference API. The call is structurally identical to the OpenAI Whisper API.

| | |
|---|---|
| Pros | Data stays within Nebius's infrastructure (EU-based data centers — potentially better GDPR posture than US vendors). OpenAI-compatible API — minimal code change vs OpenAI Whisper. No local compute required. |
| Cons | Nebius does not offer a managed Whisper endpoint in their current public catalog — requires deploying a custom inference endpoint, which adds setup complexity. Less mature STT offering than ElevenLabs. No medical vocabulary tuning. |
| Complexity | Medium |

---

### Option C: Hybrid — ElevenLabs for transcription, Nebius as fallback

ElevenLabs is used as the primary transcription service. If ElevenLabs is unavailable or for batches where cost matters, audio is routed to a Whisper endpoint on Nebius.

| | |
|---|---|
| Pros | Resilience against single-vendor outage. Cost optimization possible by routing shorter recordings to Nebius. |
| Cons | Two integrations to maintain. Fallback logic adds complexity. Output format may differ between vendors. |
| Complexity | Medium to High |

---

## Decision

**Option A selected: ElevenLabs Speech-to-Text API (`scribe_v2`).**

Audio recordings are sent to the ElevenLabs `/v1/speech-to-text` endpoint. The transcript is then passed to the Mistral chat API for structured extraction (same pipeline as documents).

### Architecture

1. Audio file (WAV, MP3, or M4A) is submitted to `/v1/speech-to-text` with model `scribe_v2`.
2. A keyterm list of domain-specific medical terms (drug names, anatomical terms, procedure names) is provided via the `keyterms` parameter to improve recognition accuracy.
3. The plain text transcript is returned and fed into the Mistral extraction pipeline.

### Consequences

- **Positive**: keyterm biasing reduces transcription errors on medical vocabulary; minimal integration effort; no local compute required.
- **Negative**: audio data is sent to ElevenLabs — data processing agreement (DPA) must be reviewed before handling real patient data.
- **Cost**: base per-minute billing applies; keyterm biasing adds a 20% surcharge.

### Rollback

Route audio to a Whisper endpoint on Nebius (Option B). The downstream Mistral extraction step is unaffected — only the transcription call changes.

---

## References

- [ElevenLabs Speech-to-Text API](https://elevenlabs.io/audio-to-text)
- [ElevenLabs API reference — /v1/speech-to-text](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- [Nebius AI infrastructure](https://nebius.com/)
- [OpenAI Whisper (model used on Nebius)](https://github.com/openai/whisper)
