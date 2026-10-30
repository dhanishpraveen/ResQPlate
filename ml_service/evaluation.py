from __future__ import annotations

from dataclasses import dataclass
import hashlib
from math import floor, sqrt
import re
from typing import Final

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

if __package__:
    from .model import CATEGORICAL_COLUMNS, FEATURE_COLUMNS, NUMERIC_COLUMNS, build_pipeline
else:
    from model import CATEGORICAL_COLUMNS, FEATURE_COLUMNS, NUMERIC_COLUMNS, build_pipeline

TARGET_COLUMN: Final = "leftover_quantity"
DEFAULT_UNIT: Final = "servings"
FIXED_SURPLUS_RATE: Final = 0.08
RIDGE_ALPHA: Final = 1.0
MIN_TRAIN_ROWS: Final = 20
MIN_VALIDATION_ROWS: Final = 10
MIN_TEST_ROWS: Final = 10
SUPPORTED_UNITS: Final = ("servings", "portions", "kg", "items")
OUTCOME_REQUIRED_COLUMNS: Final = (
    "forecast_id",
    "donor_group",
    "forecast_unit",
    "unit",
    "food_category",
    "restaurant_type",
    "meal_period",
    "planned_quantity",
    "expected_customers",
    "ready_at",
    "observed_at",
    "actual_surplus_quantity",
    "actual_sales",
    "actual_customers",
)
OUTCOME_EXPORT_COLUMNS: Final = frozenset(OUTCOME_REQUIRED_COLUMNS)
PSEUDONYM_PATTERNS: Final = {
    "forecast_id": r"forecast_[0-9a-f]{64}",
    "donor_group": r"donor_[0-9a-f]{64}",
}


@dataclass(frozen=True)
class PreparedOutcomeData:
    frame: pd.DataFrame
    unit: str
    source: str
    input_rows: int
    selected_unit_rows: int
    excluded_other_units: int
    excluded_missing_outcome: int
    excluded_invalid_rows: int


@dataclass(frozen=True)
class ChronologicalSplit:
    training: pd.DataFrame
    validation: pd.DataFrame
    test: pd.DataFrame


def _normalized_text(source: pd.Series) -> pd.Series:
    return source.astype("string").str.strip()


def _numeric(source: pd.Series) -> pd.Series:
    return pd.to_numeric(source, errors="coerce")


def _format_date_range(values: pd.Series) -> dict[str, str] | None:
    valid = values.dropna()
    if valid.empty:
        return None
    return {
        "from": pd.Timestamp(valid.min()).isoformat(),
        "to": pd.Timestamp(valid.max()).isoformat(),
    }


def validate_outcome_export(
    source: pd.DataFrame,
    *,
    now: pd.Timestamp | None = None,
) -> dict[str, object]:
    """Return privacy-safe aggregate diagnostics; never include row identifiers."""
    missing_columns = sorted(OUTCOME_EXPORT_COLUMNS - set(source.columns))
    unexpected_columns = sorted(set(source.columns) - OUTCOME_EXPORT_COLUMNS)
    if missing_columns or unexpected_columns:
        return {
            "status": "malformed_export",
            "row_count": len(source),
            "missing_columns": missing_columns,
            "unexpected_columns": unexpected_columns,
            "privacy": "No row values or identifiers are included.",
        }

    row_count = len(source)
    missing_values = {
        column: int(source[column].isna().sum())
        for column in OUTCOME_REQUIRED_COLUMNS
    }
    forecast_ids = _normalized_text(source["forecast_id"])
    duplicate_mask = forecast_ids.notna() & forecast_ids.ne("") & forecast_ids.duplicated(keep=False)
    forecast_id_counts = forecast_ids[forecast_ids.notna() & forecast_ids.ne("")].value_counts()
    duplicate_groups = int((forecast_id_counts > 1).sum())
    donor_groups = _normalized_text(source["donor_group"])
    forecast_units = _normalized_text(source["forecast_unit"]).str.lower()
    outcome_units = _normalized_text(source["unit"]).str.lower()
    known_unit_mask = forecast_units.isin(SUPPORTED_UNITS)
    unit_mismatch_mask = (source["unit"].notna() & forecast_units.ne(outcome_units).fillna(True)).fillna(False)

    ready_at = pd.to_datetime(source["ready_at"], utc=True, errors="coerce")
    observed_at = pd.to_datetime(source["observed_at"], utc=True, errors="coerce")
    planned = _numeric(source["planned_quantity"])
    expected_customers = _numeric(source["expected_customers"])
    actual_surplus = _numeric(source["actual_surplus_quantity"])
    actual_sales = _numeric(source["actual_sales"])
    actual_customers = _numeric(source["actual_customers"])
    current_time = pd.Timestamp.now(tz="UTC") if now is None else pd.Timestamp(now)
    current_time = current_time.tz_localize("UTC") if current_time.tzinfo is None else current_time.tz_convert("UTC")

    outcome_fields_present = (
        source["unit"].notna()
        | source["observed_at"].notna()
        | source["actual_surplus_quantity"].notna()
        | source["actual_sales"].notna()
        | source["actual_customers"].notna()
    )
    outcome_complete = source["unit"].notna() & source["observed_at"].notna() & source["actual_surplus_quantity"].notna()
    missing_outcome_mask = ~outcome_fields_present
    partial_outcome_mask = outcome_fields_present & ~outcome_complete
    measurement_mask = outcome_complete

    valid_forecast_pseudonym = forecast_ids.str.fullmatch(PSEUDONYM_PATTERNS["forecast_id"], na=False)
    valid_donor_pseudonym = donor_groups.str.fullmatch(PSEUDONYM_PATTERNS["donor_group"], na=False)
    pseudonym_invalid_mask = ~valid_forecast_pseudonym | ~valid_donor_pseudonym
    required_text_missing = (
        forecast_ids.isna() | forecast_ids.eq("")
        | donor_groups.isna() | donor_groups.eq("")
        | _normalized_text(source["food_category"]).isna() | _normalized_text(source["food_category"]).eq("")
        | _normalized_text(source["restaurant_type"]).isna() | _normalized_text(source["restaurant_type"]).eq("")
        | _normalized_text(source["meal_period"]).isna() | _normalized_text(source["meal_period"]).eq("")
    )

    invalid = {
        "missing_or_invalid_forecast_fields": int((required_text_missing | ready_at.isna() | ~known_unit_mask).sum()),
        "duplicate_forecast_id_rows": int(duplicate_mask.sum()),
        "duplicate_forecast_id_groups": duplicate_groups,
        "invalid_pseudonym_rows": int(pseudonym_invalid_mask.sum()),
        "inconsistent_unit_rows": int(unit_mismatch_mask.sum()),
        "partial_outcome_rows": int(partial_outcome_mask.sum()),
        "invalid_planned_quantity_rows": int((~np.isfinite(planned) | (planned <= 0)).sum()),
        "invalid_expected_customer_rows": int((~np.isfinite(expected_customers) | (expected_customers < 0) | (expected_customers.mod(1) != 0)).sum()),
        "invalid_surplus_quantity_rows": int((measurement_mask & (~np.isfinite(actual_surplus) | (actual_surplus < 0))).sum()),
        "invalid_sales_quantity_rows": int((source["actual_sales"].notna() & (~np.isfinite(actual_sales) | (actual_sales < 0))).sum()),
        "invalid_actual_customer_rows": int((source["actual_customers"].notna() & (~np.isfinite(actual_customers) | (actual_customers < 0) | (actual_customers.mod(1) != 0))).sum()),
        "invalid_ready_time_rows": int(ready_at.isna().sum()),
        "invalid_observation_time_rows": int((measurement_mask & observed_at.isna()).sum()),
        "observation_before_ready_rows": int((measurement_mask & observed_at.notna() & ready_at.notna() & (observed_at <= ready_at)).sum()),
        "future_observation_rows": int((measurement_mask & observed_at.notna() & (observed_at > current_time)).sum()),
    }
    units_report: dict[str, object] = {}
    for unit in SUPPORTED_UNITS:
        unit_forecasts = forecast_units.eq(unit)
        unit_rows = int(unit_forecasts.sum())
        unit_missing = int((unit_forecasts & missing_outcome_mask).sum())
        valid_sales = source["actual_sales"].isna() | (
            np.isfinite(actual_sales) & (actual_sales >= 0)
        )
        valid_actual_customers = source["actual_customers"].isna() | (
            np.isfinite(actual_customers)
            & (actual_customers >= 0)
            & (actual_customers.mod(1) == 0)
        )
        eligible = (
            unit_forecasts
            & ~duplicate_mask
            & measurement_mask
            & outcome_units.eq(unit)
            & ~required_text_missing
            & ~pseudonym_invalid_mask
            & ready_at.notna()
            & observed_at.notna()
            & (observed_at > ready_at)
            & (observed_at <= current_time)
            & np.isfinite(planned)
            & (planned > 0)
            & np.isfinite(expected_customers)
            & (expected_customers >= 0)
            & (expected_customers.mod(1) == 0)
            & np.isfinite(actual_surplus)
            & (actual_surplus >= 0)
            & valid_sales
            & valid_actual_customers
        )
        unit_frame = pd.DataFrame(
            {
                "ready_at": ready_at.loc[eligible],
                TARGET_COLUMN: actual_surplus.loc[eligible],
            }
        )
        split = chronological_split(unit_frame) if not unit_frame.empty else ChronologicalSplit(unit_frame, unit_frame, unit_frame)
        split_counts = {
            "train": len(split.training),
            "validation": len(split.validation),
            "test": len(split.test),
        }
        enough = (
            split_counts["train"] >= MIN_TRAIN_ROWS
            and split_counts["validation"] >= MIN_VALIDATION_ROWS
            and split_counts["test"] >= MIN_TEST_ROWS
        )
        units_report[unit] = {
            "forecast_rows": unit_rows,
            "valid_measured_outcomes": int(eligible.sum()),
            "missing_outcome_rows": unit_missing,
            "zero_surplus_rows": int((eligible & actual_surplus.eq(0)).sum()),
            "chronological_split_counts": split_counts,
            "chronological_split_ready_at_ranges": {
                "train": _format_date_range(split.training["ready_at"]),
                "validation": _format_date_range(split.validation["ready_at"]),
                "test": _format_date_range(split.test["ready_at"]),
            },
            "enough_samples": enough,
        }

    has_errors = any(invalid.values())
    has_duplicates = duplicate_groups > 0
    status = "invalid_export" if has_errors or has_duplicates else ("no_data" if row_count == 0 else "valid_export")
    return {
        "status": status,
        "row_count": row_count,
        "missing_values": missing_values,
        "duplicate_forecast_id_groups": duplicate_groups,
        "unit_counts": {
            unit: int(forecast_units.eq(unit).sum())
            for unit in SUPPORTED_UNITS
        },
        "unknown_or_missing_forecast_unit_rows": int((~known_unit_mask).sum()),
        "observation_dates": {
            "measured_outcome_rows": int(measurement_mask.sum()),
            "missing_outcome_rows": int(missing_outcome_mask.sum()),
            "valid_observation_dates": int((measurement_mask & observed_at.notna()).sum()),
            "invalid_observation_dates": int((measurement_mask & observed_at.isna()).sum()),
            "range": _format_date_range(observed_at.loc[measurement_mask]),
        },
        "invalid_rows": invalid,
        "units": units_report,
        "minimum_split_samples": {
            "train": MIN_TRAIN_ROWS,
            "validation": MIN_VALIDATION_ROWS,
            "test": MIN_TEST_ROWS,
        },
        "privacy": "No donor names, contacts, pseudonyms, or raw identifiers are included.",
    }


def prepare_outcome_dataset(
    source: pd.DataFrame,
    unit: str,
    *,
    now: pd.Timestamp | None = None,
) -> PreparedOutcomeData:
    """Prepare only forecast-linked measured outcomes for model evaluation."""
    if not unit.strip():
        raise ValueError("A single outcome unit must be selected.")
    if unit not in SUPPORTED_UNITS:
        raise ValueError(f"Unit must be one of: {', '.join(SUPPORTED_UNITS)}.")
    validation = validate_outcome_export(source, now=now)
    if validation["status"] == "malformed_export":
        details = []
        if validation["missing_columns"]:
            details.append(f"missing columns: {', '.join(validation['missing_columns'])}")
        if validation["unexpected_columns"]:
            details.append(f"unexpected columns: {', '.join(validation['unexpected_columns'])}")
        raise ValueError(f"Outcome export has an invalid schema ({'; '.join(details)}).")
    if validation["status"] == "no_data":
        empty_frame = pd.DataFrame(
            columns=[
                "donor_group",
                "unit",
                "ready_at",
                "observed_at",
                *FEATURE_COLUMNS,
                TARGET_COLUMN,
            ]
        )
        return PreparedOutcomeData(
            frame=empty_frame,
            unit=unit,
            source="forecast_outcomes_export",
            input_rows=0,
            selected_unit_rows=0,
            excluded_other_units=0,
            excluded_missing_outcome=0,
            excluded_invalid_rows=0,
        )
    if validation["status"] != "valid_export":
        raise ValueError("Outcome export contains invalid, duplicate, or inconsistent rows; run the privacy-safe validation command.")

    input_rows = len(source)
    units = _normalized_text(source["forecast_unit"]).str.lower()
    selected = source.loc[units == unit].copy()
    selected_unit_rows = len(selected)
    missing_outcome = selected["actual_surplus_quantity"].isna() | selected["observed_at"].isna()
    excluded_missing_outcome = int(missing_outcome.sum())
    labeled = selected.loc[~missing_outcome].copy()

    ready_at = pd.to_datetime(labeled["ready_at"], utc=True, errors="coerce")
    observed_at = pd.to_datetime(labeled["observed_at"], utc=True, errors="coerce")
    planned = _numeric(labeled["planned_quantity"])
    expected_customers = _numeric(labeled["expected_customers"])
    actual_surplus = _numeric(labeled["actual_surplus_quantity"])
    current_time = now if now is not None else pd.Timestamp.now(tz="UTC")
    current_time = pd.Timestamp(current_time)
    if current_time.tzinfo is None:
        current_time = current_time.tz_localize("UTC")
    else:
        current_time = current_time.tz_convert("UTC")

    valid_indexes = labeled.index
    valid_ready_at = ready_at.loc[valid_indexes]
    prepared = pd.DataFrame(
        {
            "donor_group": _normalized_text(labeled.loc[valid_indexes, "donor_group"]).to_numpy(),
            "unit": unit,
            "ready_at": valid_ready_at.to_numpy(),
            "observed_at": observed_at.loc[valid_indexes].to_numpy(),
            "restaurant_type": labeled.loc[valid_indexes, "restaurant_type"].astype("string").str.strip().to_numpy(),
            "food_category": labeled.loc[valid_indexes, "food_category"].astype("string").str.strip().to_numpy(),
            "meal_period": labeled.loc[valid_indexes, "meal_period"].astype("string").str.strip().to_numpy(),
            "day_of_week": valid_ready_at.dt.dayofweek.to_numpy(),
            "ready_hour": valid_ready_at.dt.hour.to_numpy(),
            "expected_customers": expected_customers.loc[valid_indexes].astype(int).to_numpy(),
            "planned_quantity": planned.loc[valid_indexes].astype(float).to_numpy(),
            TARGET_COLUMN: actual_surplus.loc[valid_indexes].astype(float).to_numpy(),
        }
    )
    prepared = prepared.sort_values("ready_at", kind="mergesort").reset_index(drop=True)
    return PreparedOutcomeData(
        frame=prepared,
        unit=unit,
        source="forecast_outcomes_export",
        input_rows=input_rows,
        selected_unit_rows=selected_unit_rows,
        excluded_other_units=input_rows - selected_unit_rows,
        excluded_missing_outcome=excluded_missing_outcome,
        excluded_invalid_rows=0,
    )


def prepare_synthetic_demo_dataset(source: pd.DataFrame) -> PreparedOutcomeData:
    """Explicitly adapt the fictional demo dataset; never used for real outcomes."""
    required = {
        "date",
        "restaurant_id",
        "food_category",
        "meal_period",
        "planned_preparation_quantity",
        "expected_customer_count",
        "food_ready_time",
        "leftover_quantity",
    }
    missing = required - set(source.columns)
    if missing:
        raise ValueError(f"Demo data is missing required columns: {', '.join(sorted(missing))}")

    ready_at = pd.to_datetime(
        source["date"].astype("string") + "T" + source["food_ready_time"].astype("string") + ":00Z",
        utc=True,
        errors="coerce",
    )
    demo = pd.DataFrame(
        {
            "forecast_id": [
                f"forecast_{hashlib.sha256(f'synthetic-forecast:{index}'.encode()).hexdigest()}"
                for index in range(len(source))
            ],
            "donor_group": source["restaurant_id"].map(
                lambda identifier: f"donor_{hashlib.sha256(str(identifier).encode()).hexdigest()}"
            ),
            "forecast_unit": DEFAULT_UNIT,
            "unit": DEFAULT_UNIT,
            "food_category": source["food_category"],
            "restaurant_type": "hotel",
            "meal_period": source["meal_period"],
            "planned_quantity": source["planned_preparation_quantity"],
            "expected_customers": source["expected_customer_count"],
            "ready_at": ready_at,
            "observed_at": ready_at + pd.Timedelta(hours=1),
            "actual_surplus_quantity": source["leftover_quantity"],
            "actual_sales": source.get("quantity_sold", pd.Series(pd.NA, index=source.index)),
            "actual_customers": source.get("actual_customer_count", pd.Series(pd.NA, index=source.index)),
        }
    )
    prepared = prepare_outcome_dataset(
        demo,
        DEFAULT_UNIT,
        now=pd.Timestamp.max.tz_localize("UTC"),
    )
    return PreparedOutcomeData(
        frame=prepared.frame,
        unit=prepared.unit,
        source="synthetic_demo_hotel",
        input_rows=prepared.input_rows,
        selected_unit_rows=prepared.selected_unit_rows,
        excluded_other_units=prepared.excluded_other_units,
        excluded_missing_outcome=prepared.excluded_missing_outcome,
        excluded_invalid_rows=prepared.excluded_invalid_rows,
    )


def chronological_split(
    dataset: pd.DataFrame,
    train_fraction: float = 0.6,
    validation_fraction: float = 0.2,
) -> ChronologicalSplit:
    if train_fraction <= 0 or validation_fraction <= 0 or train_fraction + validation_fraction >= 1:
        raise ValueError("Train and validation fractions must be positive and sum to less than one.")
    if "ready_at" not in dataset:
        raise ValueError("Dataset must include ready_at for chronological splitting.")
    ordered = dataset.sort_values("ready_at", kind="mergesort").reset_index(drop=True)
    count = len(ordered)
    if count == 0:
        empty = ordered.copy()
        return ChronologicalSplit(empty, empty.copy(), empty.copy())

    training_boundary_index = min(count - 1, max(0, floor(count * train_fraction) - 1))
    validation_boundary_index = min(
        count - 1,
        max(training_boundary_index + 1, floor(count * (train_fraction + validation_fraction)) - 1),
    )
    training_boundary = ordered.iloc[training_boundary_index]["ready_at"]
    validation_boundary = ordered.iloc[validation_boundary_index]["ready_at"]
    training = ordered.loc[ordered["ready_at"] <= training_boundary].copy()
    validation = ordered.loc[
        (ordered["ready_at"] > training_boundary) & (ordered["ready_at"] <= validation_boundary)
    ].copy()
    test = ordered.loc[ordered["ready_at"] > validation_boundary].copy()
    return ChronologicalSplit(
        training.reset_index(drop=True),
        validation.reset_index(drop=True),
        test.reset_index(drop=True),
    )


def build_ridge_pipeline(alpha: float = RIDGE_ALPHA) -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            ("categorical", OneHotEncoder(handle_unknown="ignore"), list(CATEGORICAL_COLUMNS)),
            ("numeric", StandardScaler(), list(NUMERIC_COLUMNS)),
        ]
    )
    return Pipeline(
        steps=[
            ("features", preprocessor),
            ("model", Ridge(alpha=alpha)),
        ]
    )


def _bounded_predictions(predictions: np.ndarray, dataset: pd.DataFrame) -> np.ndarray:
    return np.clip(predictions, 0, dataset["planned_quantity"].to_numpy(dtype=float))


def _metrics(actual: pd.Series, predictions: np.ndarray, dataset: pd.DataFrame) -> dict[str, float | int]:
    bounded = _bounded_predictions(predictions, dataset)
    return {
        "sample_count": len(dataset),
        "mae": float(mean_absolute_error(actual, bounded)),
        "rmse": sqrt(mean_squared_error(actual, bounded)),
    }


def _date_range(dataset: pd.DataFrame) -> dict[str, str] | None:
    if dataset.empty:
        return None
    return {
        "from": pd.Timestamp(dataset["ready_at"].min()).isoformat(),
        "to": pd.Timestamp(dataset["ready_at"].max()).isoformat(),
    }


def evaluate_prepared_dataset(
    prepared: PreparedOutcomeData,
    *,
    min_train_rows: int = MIN_TRAIN_ROWS,
    min_validation_rows: int = MIN_VALIDATION_ROWS,
    min_test_rows: int = MIN_TEST_ROWS,
) -> dict[str, object]:
    dataset = prepared.frame.copy()
    if dataset.empty:
        split = ChronologicalSplit(dataset, dataset.copy(), dataset.copy())
    else:
        split = chronological_split(dataset)
    split_counts = {
        "train": len(split.training),
        "validation": len(split.validation),
        "test": len(split.test),
    }
    result: dict[str, object] = {
        "source": prepared.source,
        "unit": prepared.unit,
        "sample_counts": {
            "input_rows": prepared.input_rows,
            "selected_unit_rows": prepared.selected_unit_rows,
            "valid_measured_outcomes": len(dataset),
            "excluded_other_units": prepared.excluded_other_units,
            "excluded_missing_outcome": prepared.excluded_missing_outcome,
            "excluded_invalid_rows": prepared.excluded_invalid_rows,
            **split_counts,
        },
        "split_ready_at_ranges": {
            "train": _date_range(split.training),
            "validation": _date_range(split.validation),
            "test": _date_range(split.test),
        },
        "minimum_evaluation_counts": {
            "train": min_train_rows,
            "validation": min_validation_rows,
            "test": min_test_rows,
        },
    }
    if (
        split_counts["train"] < min_train_rows
        or split_counts["validation"] < min_validation_rows
        or split_counts["test"] < min_test_rows
    ):
        result.update(
            {
                "status": "insufficient_data",
                "limitation": "No model metrics were produced because the chronological splits are below the configured evaluation minimums.",
                "model_comparison": {},
                "selected_regressor": None,
                "unseen_donor_test_count": 0,
            }
        )
        return result

    training_features = split.training.loc[:, FEATURE_COLUMNS]
    training_target = split.training[TARGET_COLUMN]
    mean_value = float(training_target.mean())
    candidates: dict[str, Pipeline | None] = {
        "historical_training_mean": None,
        "fixed_8_percent_of_planned": None,
        "ridge_alpha_1": build_ridge_pipeline(),
        "random_forest": build_pipeline(),
    }

    fitted: dict[str, Pipeline] = {}
    for name, candidate in candidates.items():
        if candidate is not None:
            candidate.fit(training_features, training_target)
            fitted[name] = candidate

    train_donors = set(split.training["donor_group"].astype(str))
    unseen_test = split.test.loc[~split.test["donor_group"].astype(str).isin(train_donors)]
    comparisons: dict[str, dict[str, object]] = {}
    for name, candidate in candidates.items():
        if name == "historical_training_mean":
            validation_predictions = np.full(len(split.validation), mean_value)
            test_predictions = np.full(len(split.test), mean_value)
        elif name == "fixed_8_percent_of_planned":
            validation_predictions = split.validation["planned_quantity"].to_numpy(dtype=float) * FIXED_SURPLUS_RATE
            test_predictions = split.test["planned_quantity"].to_numpy(dtype=float) * FIXED_SURPLUS_RATE
        else:
            model = fitted[name]
            validation_predictions = model.predict(split.validation.loc[:, FEATURE_COLUMNS])
            test_predictions = model.predict(split.test.loc[:, FEATURE_COLUMNS])

        validation_metrics = _metrics(split.validation[TARGET_COLUMN], validation_predictions, split.validation)
        test_metrics = _metrics(split.test[TARGET_COLUMN], test_predictions, split.test)
        if name in {"historical_training_mean", "fixed_8_percent_of_planned"}:
            comparisons[name] = {
                "validation": validation_metrics,
                "test": test_metrics,
                "unseen_donor_test": None,
            }
            continue

        unseen_metrics = None
        if not unseen_test.empty:
            unseen_predictions = fitted[name].predict(unseen_test.loc[:, FEATURE_COLUMNS])
            unseen_metrics = _metrics(unseen_test[TARGET_COLUMN], unseen_predictions, unseen_test)
        comparisons[name] = {
            "validation": validation_metrics,
            "test": test_metrics,
            "unseen_donor_test": unseen_metrics,
            "test_mae_delta_vs_training_mean": test_metrics["mae"] - comparisons["historical_training_mean"]["test"]["mae"],
            "test_mae_delta_vs_fixed_rate": test_metrics["mae"] - comparisons["fixed_8_percent_of_planned"]["test"]["mae"],
        }

    selected = min(
        ("ridge_alpha_1", "random_forest"),
        key=lambda name: comparisons[name]["validation"]["mae"],
    )
    result.update(
        {
            "status": "evaluated",
            "model_comparison": comparisons,
            "selected_regressor": selected,
            "unseen_donor_test_count": len(unseen_test),
            "unseen_donor_count": int(unseen_test["donor_group"].nunique()) if not unseen_test.empty else 0,
            "selection_rule": "Lowest validation MAE among Ridge and Random Forest; test scores are reported but do not select the model.",
            "prediction_bound": "Candidate predictions are clipped to zero through planned quantity, matching the current serving prediction contract.",
            "artifact_written": False,
        }
    )
    return result


def evaluate_outcome_data(source: pd.DataFrame, unit: str, **kwargs: object) -> dict[str, object]:
    prepared = prepare_outcome_dataset(source, unit)
    return evaluate_prepared_dataset(prepared, **kwargs)
