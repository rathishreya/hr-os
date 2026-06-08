"""EZ Lab 100-day onboarding tracker — the phased checklist a new hire goes through, from
Pre-joining through Week 12. Mirrors EZ Lab's real onboarding sheet (phases + tasks).

build_tasks() returns a flat task list ([{id, phase, title, category, owner, done}]) that the
OnboardingPlan stores; the frontend groups by `phase` to render the tracker.
"""
from __future__ import annotations

from typing import Any

# (phase, [(title, category, owner), ...]) — order matters; it's the timeline.
PHASES: list[tuple[str, list[tuple[str, str, str]]]] = [
    ("Pre-joining", [
        ("Documents verification", "HR", "HR"),
        ("Offer letter / folder link", "HR", "HR"),
        ("Welcome to EZ mail", "Comms", "HR"),
        ("Mail: go-to person", "Comms", "HR"),
        ("Mail to HOD / manager", "Comms", "HR"),
        ("Mail: culture & life at EZ", "Comms", "HR"),
        ("Mail: dive deeper", "Comms", "HR"),
        ("Mail: first day overview", "Comms", "HR"),
        ("Admin sheet update", "HR", "HR"),
        ("Hiring feedback form", "Feedback", "HR"),
        ("MBTI test submission (fill personality type)", "Assessment", "New hire"),
        ("Certification detail form", "HR", "New hire"),
    ]),
    ("On Joining Day", [
        ("Induction session", "Induction", "HR"),
        ("NDA (linked contract)", "Compliance", "HR"),
        ("Policy & FAQ mail + NDA", "Compliance", "HR"),
        ("Poster on EZ Life group", "Comms", "HR"),
        ("Poster on TV", "Comms", "HR"),
        ("100-day journey checklist given", "Induction", "HR"),
        ("Schedule monthly check-in 1", "Check-in", "HR"),
        ("Schedule monthly HR check-in 2", "Check-in", "HR"),
        ("Schedule monthly HR check-in 3", "Check-in", "HR"),
        ("Name the go-to person", "Buddy", "Manager"),
        ("Schedule meeting 1 w/ go-to person", "Buddy", "Go-to person"),
        ("Schedule meeting 2 w/ go-to person", "Buddy", "Go-to person"),
        ("Schedule meeting 3 w/ go-to person", "Buddy", "Go-to person"),
        ("Asset allocation + wallpaper", "IT", "IT Admin"),
        ("LinkedIn profile update", "Comms", "New hire"),
    ]),
    ("Week 1", [
        ("Meeting w/ go-to person on first Friday after joining", "Buddy", "Go-to person"),
        ("Conduct activity (EZ Relay / Crossover)", "Engagement", "HR"),
        ("ISO course completion", "Learning", "New hire"),
        ("ISO quiz (insert scores)", "Learning", "New hire"),
    ]),
    ("Week 2", [
        ("Send email to manager to share expectations", "Manager", "Manager"),
        ("Health insurance form", "HR", "New hire"),
        ("Form primer response", "Learning", "New hire"),
        ("Check-in w/ hiring manager (add comments)", "Check-in", "Manager"),
        ("Induction & onboarding feedback form", "Feedback", "New hire"),
    ]),
    ("Week 3", [
        ("Send email – meet w/ performance buddy (Tue, 6:30-8:30 PM)", "Buddy", "HR"),
        ("Manager feedback form", "Feedback", "Manager"),
    ]),
    ("Week 4", [
        ("Session w/ Joy", "Session", "HR"),
        ("Feedback on session", "Feedback", "New hire"),
        ("Brand EZ", "Session", "HR"),
    ]),
    ("Week 5", [
        ("EZ Honor Code session", "Session", "HR"),
        ("Feedback on session", "Feedback", "New hire"),
        ("Meeting w/ go-to person (2nd time)", "Buddy", "Go-to person"),
        ("Check-in w/ HR: go-to person & manager training feedback", "Check-in", "HR"),
    ]),
    ("Week 6", [
        ("EZ PDF / flashcard activity", "Learning", "New hire"),
        ("Feedback on session", "Feedback", "New hire"),
    ]),
    ("Week 7", [
        ("Sales deck session", "Session", "HR"),
    ]),
    ("Week 8", [
        ("Review session on different platforms", "Session", "HR"),
        ("Feedback on session", "Feedback", "New hire"),
    ]),
    ("Week 9", [
        ("Rotational induction / inter-department rotation program", "Rotation", "Manager"),
        ("Meeting w/ go-to person (3rd time)", "Buddy", "Go-to person"),
        ("Feedback on session", "Feedback", "New hire"),
    ]),
    ("Week 10", [
        ("Analysis: regular check-ins, feedback, quiz results, pulse check", "Review", "HR"),
        ("Send mail to manager & individual for BE column", "Review", "HR"),
    ]),
    ("Week 11", [
        ("Check-in w/ manager on the basis of analysis", "Check-in", "Manager"),
    ]),
    ("Week 12", [
        ("Completion of 100 days & certification", "Milestone", "HR"),
        ("Photograph on EZ Wall", "Milestone", "HR"),
        ("Finish checklist", "Milestone", "HR"),
        ("Write about first 100 days experience on TV / EZ Life", "Comms", "New hire"),
        ("Celebration on EZ Life", "Milestone", "HR"),
        ("Comments (hiring HR / onboarding HR)", "Notes", "HR"),
    ]),
]

# Phase order for the frontend tracker.
PHASE_ORDER = [phase for phase, _ in PHASES]


def build_tasks() -> list[dict[str, Any]]:
    tasks: list[dict[str, Any]] = []
    i = 0
    for phase, items in PHASES:
        for title, category, owner in items:
            tasks.append({"id": i, "phase": phase, "title": title, "category": category, "owner": owner, "done": False})
            i += 1
    return tasks
