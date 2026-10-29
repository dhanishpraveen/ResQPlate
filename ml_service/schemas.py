from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from .model import SUPPORTED_CATEGORIES, validate_timestamp


class PredictionRequest(BaseModel):
    restaurant_type: str = Field(min_length=1, max_length=80)
    food_category: str
    planned_quantity: float = Field(gt=0, le=100_000)
    expected_customers: int = Field(ge=0, le=100_000)
    historical_sales: float = Field(ge=0, le=100_000)
    historical_leftover: float = Field(ge=0, le=100_000)
    ready_at: datetime

    @field_validator("food_category")
    @classmethod
    def supported_category(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in SUPPORTED_CATEGORIES:
            raise ValueError(f"food_category must be one of: {', '.join(SUPPORTED_CATEGORIES)}")
        return normalized

    @field_validator("restaurant_type")
    @classmethod
    def normalized_restaurant_type(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("ready_at")
    @classmethod
    def valid_ready_at(cls, value: datetime) -> datetime:
        validate_timestamp(value)
        return value
