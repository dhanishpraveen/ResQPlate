from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class MatchCandidate:
    identifier: str
    food_category: str
    available_quantity: float
    unit: str
    ready_at: datetime
    is_confirmed: bool
    pickup_address: str | None = None
    dropoff_address: str | None = None
    travel_minutes: int | None = None


@dataclass(frozen=True)
class Demand:
    required_quantity: float
    food_category: str
    required_by: datetime
    unit: str
    dietary_constraints: str | None = None


@dataclass(frozen=True)
class MatchResult:
    candidate_id: str
    feasible: bool
    allocatable_quantity: float
    score: float
    explanation: tuple[str, ...]


def rank_matches(demand: Demand, candidates: list[MatchCandidate]) -> list[MatchResult]:
    results: list[MatchResult] = []
    for candidate in candidates:
        reasons: list[str] = []
        feasible = True
        if candidate.food_category != demand.food_category:
            feasible = False
            reasons.append("Food category does not match the requirement.")
        if candidate.unit != demand.unit:
            feasible = False
            reasons.append("Quantity units do not match.")
        if candidate.ready_at > demand.required_by:
            feasible = False
            reasons.append("Food is ready after the NGO deadline.")
        if candidate.travel_minutes is not None:
            if candidate.ready_at.timestamp() + candidate.travel_minutes * 60 > demand.required_by.timestamp():
                feasible = False
                reasons.append("Configured travel time exceeds the delivery window.")
        else:
            reasons.append("Travel time is unavailable; deadline check excludes routing time.")
        allocatable = min(max(candidate.available_quantity, 0), demand.required_quantity)
        if allocatable <= 0:
            feasible = False
            reasons.append("No quantity is available to reserve.")
        elif allocatable < demand.required_quantity:
            reasons.append(f"Partial allocation available: {allocatable:g} {demand.unit}.")
        else:
            reasons.append("Full requested quantity is available.")
        if not candidate.is_confirmed:
            reasons.append("Availability is predicted and requires donor confirmation.")
        score = 0.0
        if feasible:
            score += 50
            score += 25 if candidate.is_confirmed else 10
            score += min(25, allocatable / demand.required_quantity * 25)
            if candidate.travel_minutes is not None:
                score += max(0, 10 - candidate.travel_minutes / 10)
        results.append(
            MatchResult(
                candidate_id=candidate.identifier,
                feasible=feasible,
                allocatable_quantity=allocatable if feasible else 0,
                score=round(score, 2),
                explanation=tuple(reasons),
            )
        )
    return sorted(results, key=lambda result: (result.feasible, result.score), reverse=True)
