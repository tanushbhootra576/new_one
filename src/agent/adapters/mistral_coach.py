import json
from mistralai import Mistral

from ..domain.models.coach import CoachContext, CoachSummary
from ..domain.ports.coach import CoachPort

COACH_MODEL = "mistral-large-latest"

_SYSTEM_PROMPT = """\
You are a supportive, empathetic AI Recovery Coach for a patient.
You receive structured medical data: patient card (diagnoses, medications, procedures) and timeline.
Your job is to produce a single JSON object with the following fields:
- daily_summary: A brief, encouraging summary of where the patient is in their recovery.
- priorities: 1-3 key tasks for today.
- risks: Any potential risks to watch out for today (based on medications or recent procedures).
- questions: Suggested questions the patient should ask their doctor at the next visit.
- encouragement: A short, uplifting message.
- follow_up: General recommendations for the next few days.

Return ONLY a valid JSON object matching the CoachSummary schema. No prose, no markdown fences.
"""

_USER_PROMPT_TEMPLATE = """\
CoachSummary JSON schema (your output must validate against this):
{schema}

Patient Context:
{context}
"""

class MistralCoach(CoachPort):
    def __init__(self, client: Mistral, model: str = COACH_MODEL) -> None:
        self._client = client
        self._model = model

    def generate_summary(self, context: CoachContext) -> CoachSummary:
        user_prompt = _USER_PROMPT_TEMPLATE.format(
            schema=json.dumps(CoachSummary.model_json_schema(), indent=2),
            context=context.model_dump_json(indent=2),
        )

        response = self._client.chat.complete(
            model=self._model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        return CoachSummary.model_validate_json(content)
