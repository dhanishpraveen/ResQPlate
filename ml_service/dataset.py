from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

DEMO_RESTAURANTS = (
    ("demo_hotel_anna", "Demo Hotel Anna"),
    ("demo_hotel_garden", "Demo Hotel Garden"),
    ("demo_hotel_central", "Demo Hotel Central"),
    ("demo_hotel_sunrise", "Demo Hotel Sunrise"),
    ("demo_hotel_spice", "Demo Hotel Spice"),
)
MEAL_PERIODS = ("breakfast", "lunch", "dinner", "banquet")
FOOD_CATEGORIES = ("bakery", "prepared_meal", "produce", "salad", "sandwich")


def generate_demo_hotel_history(rows: int = 1_200, seed: int = 20261029) -> pd.DataFrame:
    if rows < 1_000:
        raise ValueError("The demo dataset must contain at least 1,000 records.")
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2023-01-01", periods=rows, freq="D")
    restaurant_indexes = rng.integers(0, len(DEMO_RESTAURANTS), rows)
    meal_period = rng.choice(MEAL_PERIODS, rows, p=[0.28, 0.3, 0.3, 0.12])
    food_category = rng.choice(FOOD_CATEGORIES, rows)
    planned = rng.integers(60, 420, rows).astype(float)
    expected_customers = np.maximum(
        15,
        (planned * rng.uniform(0.65, 1.15, rows)).round().astype(int),
    )
    weekend = dates.dayofweek >= 5
    expected_customers = expected_customers + np.where(weekend, rng.integers(8, 45, rows), 0)
    meal_demand = pd.Series(meal_period).map(
        {"breakfast": 0.78, "lunch": 0.88, "dinner": 0.92, "banquet": 0.68}
    ).to_numpy()
    category_waste = pd.Series(food_category).map(
        {"bakery": 0.12, "prepared_meal": 0.08, "produce": 0.06, "salad": 0.1, "sandwich": 0.09}
    ).to_numpy()
    actual_customers = np.minimum(
        expected_customers,
        np.maximum(0, rng.normal(expected_customers * 0.96, expected_customers * 0.12).round()),
    ).astype(int)
    quantity_sold = np.minimum(
        planned,
        np.maximum(0, (actual_customers * meal_demand + rng.normal(0, 7, rows)).round()),
    )
    leftover = np.minimum(
        planned - quantity_sold,
        np.maximum(0, (planned * category_waste + (expected_customers - actual_customers) * 0.25 + rng.normal(0, 4, rows)).round()),
    )
    ready_hours = pd.Series(meal_period).map(
        {"breakfast": 7, "lunch": 12, "dinner": 18, "banquet": 16}
    ).to_numpy()
    return pd.DataFrame(
        {
            "date": dates.strftime("%Y-%m-%d"),
            "restaurant_id": [DEMO_RESTAURANTS[index][0] for index in restaurant_indexes],
            "restaurant_name": [DEMO_RESTAURANTS[index][1] for index in restaurant_indexes],
            "day_of_week": dates.dayofweek,
            "meal_period": meal_period,
            "food_category": food_category,
            "planned_preparation_quantity": planned.astype(int),
            "expected_customer_count": expected_customers,
            "actual_customer_count": actual_customers,
            "quantity_sold": quantity_sold.astype(int),
            "leftover_quantity": leftover.astype(int),
            "food_ready_time": [f"{hour:02d}:00" for hour in ready_hours],
        }
    )


def write_demo_dataset(path: Path, rows: int = 1_200, seed: int = 20261029) -> pd.DataFrame:
    dataset = generate_demo_hotel_history(rows=rows, seed=seed)
    path.parent.mkdir(parents=True, exist_ok=True)
    dataset.to_csv(path, index=False)
    return dataset
