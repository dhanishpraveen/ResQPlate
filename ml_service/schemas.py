from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from .model import SUPPORTED_CATEGORIES, SUPPORTED_MEAL_PERIODS, validate_timestamp


class PredictionRequest(BaseModel):
    restaurant_type: str = Field(min_length=1, max_length=80)
    food_category: str
    meal_period: str
    planned_quantity: float = Field(gt=0, le=100_000)
    expected_customers: int = Field(ge=0, le=100_000)
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

    @field_validator("meal_period")
    @classmethod
    def supported_meal_period(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in SUPPORTED_MEAL_PERIODS:
            raise ValueError(f"meal_period must be one of: {', '.join(SUPPORTED_MEAL_PERIODS)}")
        return normalized

    @field_validator("ready_at")
    @classmethod
    def valid_ready_at(cls, value: datetime) -> datetime:
        validate_timestamp(value)
        return value
