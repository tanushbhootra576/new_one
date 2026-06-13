from typing import List, Dict, Any
from pydantic import BaseModel

class CoachContext(BaseModel):
    patient_card: Dict[str, Any]
    timeline: List[Dict[str, Any]]

class CoachSummary(BaseModel):
    daily_summary: str
    priorities: List[str]
    risks: List[str]
    questions: List[str]
    encouragement: str
    follow_up: List[str]
