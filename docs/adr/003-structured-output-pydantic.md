# ADR 003: Structured Output Extraction to Pydantic Models

**Date:** 2026-04-11
**Status:** Accepted
**Deciders:** Team

---

## Context

After processing each input (image, PDF, audio transcript), the application calls the Mistral chat API to extract structured medical information. The output must be validated Pydantic model instances.

LLMs return free-form text or loosely structured JSON that may deviate from the expected schema (missing fields, wrong types, hallucinated keys). The challenge is to bridge the gap between Mistral's output and strict Pydantic validation reliably, without complex post-processing.

The team has decided to use the **Mistral API** exclusively. Mistral supports:

- **JSON mode**: `response_format={"type": "json_object"}` forces the model to output valid JSON.
- **Function calling / tool use**: the model is constrained to call a defined tool, returning a structured payload.
- **`instructor` library**: supports Mistral via `instructor.from_mistral()`, wrapping either JSON mode or tool use.

---

## Options considered

### Option A: Mistral JSON mode + manual Pydantic validation

The prompt instructs the model to return JSON matching the target schema. `response_format={"type": "json_object"}` ensures valid JSON syntax. The response is parsed and passed to `Model.model_validate()`. Validation errors trigger a manual retry with the error message injected into the prompt.

| | |
|---|---|
| Pros | No extra dependency beyond `mistralai`. Full visibility on what is sent to the model. JSON mode prevents syntax errors. |
| Cons | Schema compliance is not enforced at the API level — field names, types, and optionals can still be wrong. Retry logic must be written manually. |
| Complexity | Medium |

---

### Option B: `instructor` library with Mistral client

`instructor.from_mistral()` wraps the Mistral client. A `response_model` parameter accepts a Pydantic class directly. The library serializes the schema, calls the API using tool use or JSON mode, deserializes the response, and retries automatically on validation failure.

| | |
|---|---|
| Pros | Declarative: pass a Pydantic class, receive a validated instance. Built-in retry with structured validation error feedback. Minimal boilerplate. Actively maintained with Mistral support. |
| Cons | Additional dependency (`instructor`). Abstracts the request — what is sent to the model is less visible. Version coupling between `instructor` and `mistralai` SDK. |
| Complexity | Low |

---

### Option C: Mistral native function calling / tool use

The target Pydantic schema is serialized to a Mistral tool definition. The model is instructed to call the tool, returning a structured JSON payload. The tool call arguments are parsed back into a Pydantic model.

| | |
|---|---|
| Pros | Schema enforcement at the API level — the model must respect the tool signature. No extra library. Uses the native `mistralai` SDK only. |
| Cons | Requires manual serialization of the Pydantic schema to the Mistral tool format. Tool call response parsing is more verbose than Option B. More boilerplate per model class. |
| Complexity | Medium |

---

## Decision

**Option B selected: `instructor` library with Mistral client.**

The Mistral client is wrapped with `instructor.from_mistral()`. Each extraction call passes a Pydantic class as `response_model` and receives a validated instance of that class directly — no manual JSON parsing or schema serialization.

### Architecture

1. Define one Pydantic model per input type (prescription, operation report, audio transcript).
2. Wrap the Mistral client once at application startup: `client = instructor.from_mistral(MistralClient(...))`.
3. Each extraction call passes the target `response_model`; `instructor` handles schema injection, response parsing, and validation.
4. On validation failure, `instructor` automatically retries with the Pydantic error fed back into the prompt (up to a configurable `max_retries`).

### Consequences

- **Positive**: callers receive a typed Pydantic instance; no parsing logic to maintain; retry-on-failure is built-in.
- **Negative**: adds `instructor` as a dependency; version compatibility between `instructor` and `mistralai` SDK must be monitored.

### Rollback

Remove `instructor` and revert to Option A (Mistral JSON mode + manual `model_validate`). The Pydantic model definitions remain unchanged — only the client call site changes.

---

## References

- [Mistral JSON mode](https://docs.mistral.ai/capabilities/structured-outputs/json-mode/)
- [Mistral function calling](https://docs.mistral.ai/capabilities/function-calling/)
- [Instructor + Mistral](https://python.useinstructor.com/integrations/mistral/)
- [Pydantic model_validate](https://docs.pydantic.dev/latest/concepts/models/#model-methods-and-properties)
