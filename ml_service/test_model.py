from datetime import datetime, timezone

import pytest

from .model import FEATURE_COLUMNS, make_development_dataset, predict, train_model
from .schemas import PredictionRequest


def test_training_and_prediction_provide_uncertainty() -> None:
    dataset = make_development_dataset()
    model = train_model(dataset)
    payload = dataset.iloc[0][list(FEATURE_COLUMNS)].to_dict()
    result = predict(model, payload)
    assert result.quantity >= 0
    assert result.lower_bound <= result.quantity <= result.upper_bound


def test_request_rejects_unknown_category() -> None:
    with pytest.raises(ValueError):
        PredictionRequest(
            restaurant_type="cafe",
            food_category="unknown",
            planned_quantity=20,
            expected_customers=10,
            historical_sales=8,
            historical_leftover=2,
            ready_at=datetime.now(timezone.utc),
        )


def test_request_requires_timezone() -> None:
    with pytest.raises(ValueError):
        PredictionRequest(
            restaurant_type="cafe",
            food_category="salad",
            planned_quantity=20,
            expected_customers=10,
            historical_sales=8,
            historical_leftover=2,
            ready_at=datetime(2026, 10, 29),
        )
