from datetime import datetime

from pydantic import BaseModel, Field

from .matching import Demand, MatchCandidate


class MatchCandidateRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=128)
    food_category: str = Field(min_length=1, max_length=80)
    available_quantity: float = Field(ge=0)
    unit: str = Field(min_length=1, max_length=32)
    ready_at: datetime
    is_confirmed: bool
    pickup_address: str | None = None
    dropoff_address: str | None = None
    travel_minutes: int | None = Field(default=None, ge=0, le=10_000)

    def to_domain(self) -> MatchCandidate:
        return MatchCandidate(**self.model_dump())


class MatchRequest(BaseModel):
    required_quantity: float = Field(gt=0)
    food_category: str = Field(min_length=1, max_length=80)
    required_by: datetime
    unit: str = Field(min_length=1, max_length=32)
    dietary_constraints: str | None = Field(default=None, max_length=2_000)
    candidates: list[MatchCandidateRequest] = Field(max_length=100)

    def to_domain(self) -> Demand:
        return Demand(
            required_quantity=self.required_quantity,
            food_category=self.food_category,
            required_by=self.required_by,
            unit=self.unit,
            dietary_constraints=self.dietary_constraints,
        )
