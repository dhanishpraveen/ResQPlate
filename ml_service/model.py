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

MODEL_VERSION: Final = "rf-dev-synthetic-v1"
TARGET_UNIT: Final = "servings"
SUPPORTED_CATEGORIES: Final = ("bakery", "prepared_meal", "produce", "salad", "sandwich")
FEATURE_COLUMNS: Final = (
    "restaurant_type",
    "food_category",
    "day_of_week",
    "ready_hour",
    "expected_customers",
    "planned_quantity",
    "historical_sales",
    "historical_leftover",
)
CATEGORICAL_COLUMNS: Final = ("restaurant_type", "food_category")
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
            ("categorical", OneHotEncoder(handle_unknown="error"), list(CATEGORICAL_COLUMNS)),
            ("numeric", "passthrough", list(NUMERIC_COLUMNS)),
        ]
    )
    return Pipeline(
        steps=[
            ("features", preprocessor),
            (
                "model",
                RandomForestRegressor(
                    n_estimators=160,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )


def make_development_dataset(rows: int = 240) -> pd.DataFrame:
    """Create labelled development data until real historical records are available."""
    rng = np.random.default_rng(42)
    dates = pd.date_range("2025-01-01", periods=rows, freq="D")
    categories = np.array(SUPPORTED_CATEGORIES)
    restaurant_types = np.array(["cafe", "caterer", "restaurant"])
    frame = pd.DataFrame(
        {
            "restaurant_type": rng.choice(restaurant_types, rows),
            "food_category": rng.choice(categories, rows),
            "day_of_week": dates.dayofweek,
            "ready_hour": rng.integers(10, 21, rows),
            "expected_customers": rng.integers(20, 260, rows),
            "planned_quantity": rng.integers(25, 320, rows),
            "historical_sales": rng.integers(15, 280, rows),
            "historical_leftover": rng.integers(0, 55, rows),
        }
    )
    category_effect = frame["food_category"].map(
        {"bakery": 0.06, "prepared_meal": 0.12, "produce": 0.04, "salad": 0.08, "sandwich": 0.1}
    )
    frame["surplus_quantity"] = np.maximum(
        0,
        frame["planned_quantity"]
        - frame["historical_sales"]
        + frame["historical_leftover"]
        + frame["expected_customers"] * category_effect
        + rng.normal(0, 7, rows),
    )
    return frame


def train_model(dataset: pd.DataFrame) -> Pipeline:
    missing = set(FEATURE_COLUMNS + ("surplus_quantity",)) - set(dataset.columns)
    if missing:
        raise ValueError(f"Dataset is missing required columns: {', '.join(sorted(missing))}")
    if len(dataset) < 20:
        raise ValueError("At least 20 historical rows are required to train the model.")
    model = build_pipeline()
    model.fit(dataset[list(FEATURE_COLUMNS)], dataset["surplus_quantity"])
    return model


def save_model(model: Pipeline, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "model_version": MODEL_VERSION, "unit": TARGET_UNIT}, path)


def load_model(path: Path) -> tuple[Pipeline, str, str]:
    if not path.is_file():
        raise FileNotFoundError(f"Model artifact not found: {path}. Run the training command first.")
    artifact = joblib.load(path)
    return artifact["model"], artifact["model_version"], artifact["unit"]


def predict(model: Pipeline, payload: dict[str, object], model_version: str = MODEL_VERSION) -> Prediction:
    features = pd.DataFrame([payload], columns=FEATURE_COLUMNS)
    quantity = float(model.predict(features)[0])
    forest = model.named_steps["model"]
    transformed = model.named_steps["features"].transform(features)
    tree_values = np.asarray([tree.predict(transformed)[0] for tree in forest.estimators_])
    lower, upper = np.quantile(tree_values, [0.1, 0.9])
    return Prediction(
        quantity=round(max(0.0, quantity), 2),
        lower_bound=round(max(0.0, float(lower)), 2),
        upper_bound=round(max(0.0, float(upper)), 2),
        model_version=model_version,
        unit=TARGET_UNIT,
    )


def validate_timestamp(value: datetime) -> None:
    if value.tzinfo is None:
        raise ValueError("ready_at must include a timezone.")
    if value.year < 2020:
        raise ValueError("ready_at must be a current or future planning date.")
