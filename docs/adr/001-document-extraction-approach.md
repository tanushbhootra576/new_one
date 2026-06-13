# ADR 001: Document Extraction Approach (Images and PDFs)

**Date:** 2026-04-11
**Status:** Accepted
**Deciders:** Team

---

## Context

The application must extract structured medical information from two document types:

- **Prescription images** (photos or scans of handwritten or printed prescriptions)
- **PDF operation reports** (post-operative reports, possibly text-based or scanned)

Medical documents are not standardized. Layout, typography, and vocabulary vary significantly between practitioners and institutions. Handwritten content is common for prescriptions. The extracted data must feed typed Pydantic models.

The team has decided to use the **Mistral API** as the sole LLM provider. Mistral offers two relevant capabilities:

- **Mistral OCR** (`mistral-ocr-latest`): a dedicated document OCR API that processes images and PDFs, returning structured markdown with layout preservation.
- **Pixtral** (`pixtral-large-latest`): a vision-capable chat model that accepts image inputs alongside text prompts.

---

## Options considered

### Option A: Mistral OCR for all document inputs

All inputs (prescription images and PDFs) are sent to the Mistral OCR API. It returns structured markdown. A second Mistral chat call extracts the target fields from that markdown.

| | |
|---|---|
| Pros | Dedicated OCR step produces clean, structured text before extraction. Handles both images and PDFs with a single API surface. Good layout preservation (tables, sections). |
| Cons | Two API calls per document (OCR + extraction). OCR quality on handwritten prescriptions is uncertain. |
| Complexity | Low |

---

### Option B: Pixtral vision for all document inputs

Images are sent directly to `pixtral-large-latest` with a structured extraction prompt. PDFs are converted to images page by page (e.g. with `pdf2image`) before being passed to the same model.

| | |
|---|---|
| Pros | Single API call per document. Pixtral understands layout and context together — better suited to handwriting and implicit field inference. No intermediate OCR step. |
| Cons | PDFs require a conversion step (image rendering). More image tokens consumed per page. PDF-to-image conversion adds a dependency (`pdf2image` / `poppler`). |
| Complexity | Low to Medium |

---

### Option C: Hybrid — Mistral OCR for PDFs, Pixtral for images

Text-based and scanned PDFs go through Mistral OCR. Prescription images go directly to Pixtral vision. The downstream extraction prompt receives either the OCR markdown or the raw image depending on input type.

| | |
|---|---|
| Pros | Each input type is handled by the most appropriate Mistral capability. Reduces image-token usage for PDFs. |
| Cons | Two code paths. Input type detection required. More surface area to maintain and test. |
| Complexity | Medium |

---

## Decision

**Option A selected: Mistral OCR for all document inputs.**

All document inputs (prescription images and PDFs) are processed via `mistral-ocr-latest`. The returned structured markdown is then passed to a Mistral chat model for field extraction into the target Pydantic schema.

### Architecture

1. Input (image or PDF) is base64-encoded or uploaded as a file reference.
2. A single call to `mistral-ocr-latest` returns structured markdown preserving layout.
3. The markdown is passed to a Mistral chat model with a structured extraction prompt (see ADR-003 for output strategy).
4. The chat model returns the extracted data in the format defined by the Pydantic schema.

### Consequences

- **Positive**: single API surface (Mistral only), no local dependencies, uniform code path for both input types.
- **Negative**: two API calls per document (OCR + extraction); OCR quality on heavily handwritten prescriptions must be validated empirically.
- **Risk**: if `mistral-ocr-latest` fails on a document, there is no automatic fallback to vision mode. A fallback to Pixtral (Option B) can be added later if OCR accuracy proves insufficient on handwritten inputs.

### Rollback

Revert to Option B (Pixtral vision) by replacing the OCR call with a direct image input to `pixtral-large-latest`. The extraction step (Mistral chat) remains unchanged.

---

## References

- [Mistral OCR documentation](https://docs.mistral.ai/capabilities/document/)
- [Pixtral vision documentation](https://docs.mistral.ai/capabilities/vision/)
- [pdf2image](https://github.com/Belval/pdf2image)
