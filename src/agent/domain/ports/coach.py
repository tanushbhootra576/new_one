from typing import Protocol
from .coach import CoachContext, CoachSummary

class CoachPort(Protocol):
    def generate_summary(self, context: CoachContext) -> CoachSummary:
        ...
