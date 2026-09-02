"""Onboarding: the checklist the People team runs, and the session catalogue behind it."""
from .steps import BY_KEY as STEP_BY_KEY, PHASES, STATUSES, STEPS, Step, steps_for
from .sessions import CATALOGUE, FREQUENCIES, MODES, SessionDef, catalogue_for

__all__ = [
    "STEP_BY_KEY", "PHASES", "STATUSES", "STEPS", "Step", "steps_for",
    "CATALOGUE", "FREQUENCIES", "MODES", "SessionDef", "catalogue_for",
]
