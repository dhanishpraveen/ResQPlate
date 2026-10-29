from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from .dataset import generate_demo_hotel_history
from .main import app
from .model import FEATURE_COLUMNS, make_development_dataset, predict, prepare_dataset, train_model
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
            meal_period="lunch",
            planned_quantity=20,
            expected_customers=10,
            ready_at=datetime.now(timezone.utc),
        )


def test_request_requires_timezone() -> None:
    with pytest.raises(ValueError):
        PredictionRequest(
            restaurant_type="cafe",
            food_category="salad",
            meal_period="lunch",
            planned_quantity=20,
            expected_customers=10,
            ready_at=datetime(2026, 10, 29),
        )


def test_dataset_is_reproducible_and_valid() -> None:
    first = generate_demo_hotel_history()
    second = generate_demo_hotel_history()
    assert len(first) == 1_200
    assert first.equals(second)
    assert (first["leftover_quantity"] >= 0).all()
    assert (first["leftover_quantity"] <= first["planned_preparation_quantity"]).all()
    assert first["restaurant_name"].nunique() == 5


def test_prediction_is_finite_and_does_not_exceed_planned_quantity() -> None:
    model = train_model(make_development_dataset())
    payload = {
        "restaurant_type": "hotel",
        "food_category": "prepared_meal",
        "meal_period": "dinner",
        "day_of_week": 5,
        "ready_hour": 18,
        "expected_customers": 150,
        "planned_quantity": 40,
    }
    result = predict(model, payload)
    assert result.quantity <= payload["planned_quantity"]
    assert result.quantity >= 0
    assert result.quantity == result.quantity


def test_prepare_dataset_rejects_missing_columns() -> None:
    with pytest.raises(ValueError, match="missing required columns"):
        prepare_dataset(generate_demo_hotel_history().drop(columns=["meal_period"]))


def test_api_health_and_prediction_use_persisted_contract() -> None:
    client = TestClient(app)
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["training_data"] == "synthetic_demo_hotel"
    response = client.post(
        "/predict",
        json={
            "restaurant_type": "restaurant",
            "food_category": "salad",
            "meal_period": "lunch",
            "planned_quantity": 100,
            "expected_customers": 80,
            "ready_at": "2030-06-15T12:00:00+00:00",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert 0 <= body["predicted_quantity"] <= 100
    assert body["model_version"] == "rf-demo-hotel-v2"


def test_api_rejects_invalid_meal_period() -> None:
    response = TestClient(app).post(
        "/predict",
        json={
            "restaurant_type": "restaurant",
            "food_category": "salad",
            "meal_period": "midnight",
            "planned_quantity": 100,
            "expected_customers": 80,
            "ready_at": "2030-06-15T12:00:00+00:00",
        },
    )
    assert response.status_code == 422
