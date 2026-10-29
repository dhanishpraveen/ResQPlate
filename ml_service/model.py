from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Final

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from .dataset import FOOD_CATEGORIES, MEAL_PERIODS, generate_demo_hotel_history

MODEL_VERSION: Final = "rf-demo-hotel-v2"
TARGET_UNIT: Final = "servings"
SUPPORTED_CATEGORIES: Final = FOOD_CATEGORIES
SUPPORTED_MEAL_PERIODS: Final = MEAL_PERIODS
FEATURE_COLUMNS: Final = (
    "restaurant_type",
    "food_category",
    "meal_period",
    "day_of_week",
    "ready_hour",
    "expected_customers",
    "planned_quantity",
)
CATEGORICAL_COLUMNS: Final = ("restaurant_type", "food_category", "meal_period")
NUMERIC_COLUMNS: Final = tuple(column for column in FEATURE_COLUMNS if column not in CATEGORICAL_COLUMNS)


@dataclass(frozen=True)
class Prediction:
    quantity: float
    lower_bound: float
    upper_bound: float
    model_version: str
    unit: str


def build_pipeline() -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            ("categorical", OneHotEncoder(handle_unknown="ignore"), list(CATEGORICAL_COLUMNS)),
            ("numeric", "passthrough", list(NUMERIC_COLUMNS)),
        ]
    )
    return Pipeline(
        steps=[
            ("features", preprocessor),
            ("model", RandomForestRegressor(n_estimators=160, min_samples_leaf=2, random_state=42, n_jobs=-1)),
        ]
    )


def make_development_dataset(rows: int = 1_200) -> pd.DataFrame:
    source = generate_demo_hotel_history(rows=rows)
    return pd.DataFrame(
        {
            "restaurant_type": "hotel",
            "food_category": source["food_category"],
            "meal_period": source["meal_period"],
            "day_of_week": source["day_of_week"],
            "ready_hour": source["food_ready_time"].str.slice(0, 2).astype(int),
            "expected_customers": source["expected_customer_count"],
            "planned_quantity": source["planned_preparation_quantity"],
            "leftover_quantity": source["leftover_quantity"],
        }
    )


def prepare_dataset(source: pd.DataFrame) -> pd.DataFrame:
    required = {
        "food_category",
        "meal_period",
        "day_of_week",
        "planned_preparation_quantity",
        "expected_customer_count",
        "food_ready_time",
        "leftover_quantity",
    }
    missing = required - set(source.columns)
    if missing:
        raise ValueError(f"Dataset is missing required columns: {', '.join(sorted(missing))}")
    prepared = pd.DataFrame(
        {
            "restaurant_type": "hotel",
            "food_category": source["food_category"],
            "meal_period": source["meal_period"],
            "day_of_week": source["day_of_week"],
            "ready_hour": source["food_ready_time"].str.slice(0, 2).astype(int),
            "expected_customers": source["expected_customer_count"],
            "planned_quantity": source["planned_preparation_quantity"],
            "leftover_quantity": source["leftover_quantity"],
        }
    )
    if (prepared["leftover_quantity"] < 0).any() or (prepared["leftover_quantity"] > prepared["planned_quantity"]).any():
        raise ValueError("Dataset contains invalid leftover quantities.")
    return prepared


def train_model(dataset: pd.DataFrame) -> Pipeline:
    missing = set(FEATURE_COLUMNS + ("leftover_quantity",)) - set(dataset.columns)
    if missing:
        raise ValueError(f"Dataset is missing required columns: {', '.join(sorted(missing))}")
    if len(dataset) < 20:
        raise ValueError("At least 20 historical rows are required to train the model.")
    model = build_pipeline()
    model.fit(dataset[list(FEATURE_COLUMNS)], dataset["leftover_quantity"])
    return model


def save_model(model: Pipeline, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "model_version": MODEL_VERSION, "unit": TARGET_UNIT, "training_data": "synthetic_demo_hotel"}, path)


def load_model(path: Path) -> tuple[Pipeline, str, str]:
    if not path.is_file():
        raise FileNotFoundError(f"Model artifact not found: {path}. Run the training command first.")
    artifact = joblib.load(path)
    return artifact["model"], artifact["model_version"], artifact["unit"]


def predict(model: Pipeline, payload: dict[str, object], model_version: str = MODEL_VERSION) -> Prediction:
    features = pd.DataFrame([payload], columns=FEATURE_COLUMNS)
    planned_quantity = float(features.iloc[0]["planned_quantity"])
    quantity = float(model.predict(features)[0])
    forest = model.named_steps["model"]
    transformed = model.named_steps["features"].transform(features)
    tree_values = np.asarray([tree.predict(transformed)[0] for tree in forest.estimators_])
    lower, upper = np.quantile(tree_values, [0.1, 0.9])
    return Prediction(
        quantity=round(min(planned_quantity, max(0.0, quantity)), 2),
        lower_bound=round(min(planned_quantity, max(0.0, float(lower))), 2),
        upper_bound=round(min(planned_quantity, max(0.0, float(upper))), 2),
        model_version=model_version,
        unit=TARGET_UNIT,
    )


def validate_timestamp(value: datetime) -> None:
    if value.tzinfo is None:
        raise ValueError("ready_at must include a timezone.")
    if value.year < 2020:
        raise ValueError("ready_at must be a current or future planning date.")
