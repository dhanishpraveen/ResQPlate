from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib

import numpy as np
import pandas as pd
import pytest

from .dataset import generate_demo_hotel_history
from .evaluation import (
    OUTCOME_REQUIRED_COLUMNS,
    TARGET_COLUMN,
    chronological_split,
    evaluate_prepared_dataset,
    prepare_outcome_dataset,
    prepare_synthetic_demo_dataset,
    validate_outcome_export,
)
from .evaluate import _read_outcome_csv
from .pseudonymize_outcomes import pseudonymize_export


def outcome_row(
    index: int,
    *,
    unit: str = "servings",
    ready_at: datetime | None = None,
    observed_at: datetime | None = None,
    surplus: float | None = 12.0,
    donor_id: str | None = None,
) -> dict[str, object]:
    ready = ready_at or datetime(2030, 1, 1, tzinfo=timezone.utc) + timedelta(days=index)
    observed = observed_at or ready + timedelta(hours=1)
    test_key = b"unit-test-pseudonym-key-is-not-real"
    forecast_pseudonym = hashlib.sha256(f"forecast:{index}".encode()).hexdigest()
    donor_pseudonym = hashlib.sha256(f"donor:{donor_id or f'donor-{index % 2}'}".encode()).hexdigest()
    return {
        "forecast_id": f"forecast_{hashlib.sha256(test_key + forecast_pseudonym.encode()).hexdigest()}",
        "donor_group": f"donor_{hashlib.sha256(test_key + donor_pseudonym.encode()).hexdigest()}",
        "forecast_unit": unit,
        "unit": unit,
        "food_category": "prepared_meal",
        "restaurant_type": "restaurant",
        "meal_period": "lunch",
        "planned_quantity": 100.0,
        "expected_customers": 70,
        "ready_at": ready.isoformat(),
        "observed_at": observed.isoformat(),
        "actual_surplus_quantity": surplus,
        "actual_sales": 33.0,
        "actual_customers": 65,
    }


def prepared_rows(rows: list[dict[str, object]], unit: str = "servings"):
    return prepare_outcome_dataset(
        pd.DataFrame(rows),
        unit,
        now=pd.Timestamp("2031-01-01T00:00:00Z"),
    )


def test_outcome_filter_uses_measured_surplus_and_excludes_missing_or_invalid_rows() -> None:
    ready = datetime(2030, 1, 1, tzinfo=timezone.utc)
    rows = [
        outcome_row(1, ready_at=ready, surplus=7.5),
        outcome_row(2, unit="kg", ready_at=ready + timedelta(days=1), surplus=2.0),
        outcome_row(3, ready_at=ready + timedelta(days=2), surplus=None),
        outcome_row(
            4,
            ready_at=ready + timedelta(days=3),
            observed_at=ready + timedelta(days=3, hours=1),
            surplus=9.0,
        ),
    ]
    rows[2]["unit"] = None
    rows[2]["observed_at"] = None
    rows[2]["actual_sales"] = None
    rows[2]["actual_customers"] = None

    prepared = prepared_rows(rows)

    assert prepared.input_rows == 4
    assert prepared.selected_unit_rows == 3
    assert prepared.excluded_other_units == 1
    assert prepared.excluded_missing_outcome == 1
    assert prepared.excluded_invalid_rows == 0
    assert prepared.frame[TARGET_COLUMN].tolist() == [7.5, 9.0]
    assert prepared.frame.iloc[0][TARGET_COLUMN] != 45.0
    assert not {"forecast_id", "predicted_quantity", "confirmed_quantity", "quantity_handed_over", "actual_sales", "actual_customers"} & set(prepared.frame.columns)


def test_outcome_filter_rejects_duplicate_forecasts_and_invalid_schema() -> None:
    duplicate = outcome_row(1)
    with pytest.raises(ValueError, match="invalid, duplicate, or inconsistent"):
        prepared_rows([duplicate, {**duplicate, "actual_surplus_quantity": 20.0}])

    with pytest.raises(ValueError, match="missing columns"):
        prepare_outcome_dataset(pd.DataFrame([{"forecast_id": "forecast-1"}]), "servings")

    with pytest.raises(ValueError, match="single outcome unit"):
        prepare_outcome_dataset(pd.DataFrame(), " ")


def test_unit_selection_keeps_quantities_separate() -> None:
    prepared = prepared_rows([
        outcome_row(1, unit="servings", surplus=12),
        outcome_row(2, unit="kg", surplus=3),
        outcome_row(3, unit="items", surplus=50),
    ])

    assert prepared.unit == "servings"
    assert prepared.frame["unit"].unique().tolist() == ["servings"]
    assert prepared.frame[TARGET_COLUMN].tolist() == [12]
    assert prepared.excluded_other_units == 2


def test_chronological_split_is_ordered_and_does_not_split_identical_ready_times() -> None:
    rows = [outcome_row(index) for index in range(20)]
    rows.extend([
        outcome_row(20, ready_at=datetime(2030, 1, 20, tzinfo=timezone.utc)),
        outcome_row(21, ready_at=datetime(2030, 1, 20, tzinfo=timezone.utc)),
    ])
    dataset = prepared_rows(rows).frame

    split = chronological_split(dataset)

    assert split.training["ready_at"].max() < split.validation["ready_at"].min()
    assert split.validation["ready_at"].max() < split.test["ready_at"].min()
    assert len(split.training) + len(split.validation) + len(split.test) == len(dataset)
    assert not (split.training["ready_at"] == datetime(2030, 1, 20, tzinfo=timezone.utc)).any()


def test_comparison_reports_baselines_models_and_unseen_donor_metrics() -> None:
    rows = [
        outcome_row(
            index,
            donor_id="known-donor" if index < 30 else "new-donor",
            surplus=float(index + 1),
        )
        for index in range(50)
    ]
    prepared = prepared_rows(rows)

    report = evaluate_prepared_dataset(
        prepared,
        min_train_rows=20,
        min_validation_rows=10,
        min_test_rows=10,
    )

    assert report["status"] == "evaluated"
    assert report["unit"] == "servings"
    assert report["source"] == "forecast_outcomes_export"
    assert report["selected_regressor"] in {"ridge_alpha_1", "random_forest"}
    assert report["unseen_donor_test_count"] == 10
    assert report["unseen_donor_count"] == 1
    assert report["artifact_written"] is False
    assert report["sample_counts"]["train"] == 30
    assert report["sample_counts"]["validation"] == 10
    assert report["sample_counts"]["test"] == 10

    comparisons = report["model_comparison"]
    assert set(comparisons) == {
        "historical_training_mean",
        "fixed_8_percent_of_planned",
        "ridge_alpha_1",
        "random_forest",
    }
    test_targets = np.arange(41, 51, dtype=float)
    expected_mean_mae = float(np.mean(np.abs(test_targets - 15.5)))
    assert comparisons["historical_training_mean"]["test"]["mae"] == pytest.approx(expected_mean_mae)
    assert comparisons["fixed_8_percent_of_planned"]["test"]["mae"] == pytest.approx(
        float(np.mean(np.abs(test_targets - 8.0)))
    )
    assert comparisons["ridge_alpha_1"]["test"]["sample_count"] == 10
    assert comparisons["random_forest"]["unseen_donor_test"]["sample_count"] == 10
    assert "from" in report["split_ready_at_ranges"]["test"]
    assert "to" in report["split_ready_at_ranges"]["test"]


def test_insufficient_data_is_reported_without_fitting_models() -> None:
    prepared = prepared_rows([outcome_row(index) for index in range(30)])
    report = evaluate_prepared_dataset(prepared)

    assert report["status"] == "insufficient_data"
    assert report["model_comparison"] == {}
    assert report["selected_regressor"] is None
    assert "minimums" in report["limitation"]


def test_missing_local_outcome_export_produces_insufficient_data_report() -> None:
    prepared = prepare_outcome_dataset(
        pd.DataFrame(columns=OUTCOME_REQUIRED_COLUMNS),
        "servings",
    )

    report = evaluate_prepared_dataset(prepared)

    assert report["status"] == "insufficient_data"
    assert report["sample_counts"]["input_rows"] == 0
    assert report["sample_counts"]["valid_measured_outcomes"] == 0


def test_synthetic_demo_is_explicitly_labeled_and_never_reported_as_real() -> None:
    demo = prepare_synthetic_demo_dataset(generate_demo_hotel_history(rows=1_000))

    assert demo.source == "synthetic_demo_hotel"
    assert demo.unit == "servings"
    assert len(demo.frame) == 1_000
    assert demo.frame[TARGET_COLUMN].between(0, demo.frame["planned_quantity"]).all()
    assert not {"predicted_quantity", "confirmed_quantity", "quantity_handed_over"} & set(demo.frame.columns)


def test_split_rejects_invalid_fractions() -> None:
    with pytest.raises(ValueError, match="fractions"):
        chronological_split(pd.DataFrame({"ready_at": pd.date_range("2030-01-01", periods=5)}), 0.8, 0.3)


def test_validation_reports_missing_data_separately_from_valid_zero_surplus() -> None:
    missing_outcome = outcome_row(1)
    missing_outcome["unit"] = None
    missing_outcome["observed_at"] = None
    missing_outcome["actual_surplus_quantity"] = None
    missing_outcome["actual_sales"] = None
    missing_outcome["actual_customers"] = None
    zero_outcome = outcome_row(2, surplus=0)

    report = validate_outcome_export(
        pd.DataFrame([missing_outcome, zero_outcome]),
        now=pd.Timestamp("2031-01-01T00:00:00Z"),
    )

    assert report["status"] == "valid_export"
    assert report["units"]["servings"]["missing_outcome_rows"] == 1
    assert report["units"]["servings"]["zero_surplus_rows"] == 1
    assert report["units"]["servings"]["valid_measured_outcomes"] == 1


def test_validation_reports_malformed_export_and_invalid_quantities() -> None:
    malformed = validate_outcome_export(pd.DataFrame([{"forecast_id": "secret-value"}]))
    assert malformed["status"] == "malformed_export"
    assert "secret-value" not in str(malformed)

    negative_quantity = outcome_row(1, surplus=-1)
    large_observed_surplus = outcome_row(2, surplus=101)
    bad_sales = outcome_row(3)
    bad_sales["actual_sales"] = -2
    report = validate_outcome_export(
        pd.DataFrame([negative_quantity, large_observed_surplus, bad_sales]),
        now=pd.Timestamp("2031-01-01T00:00:00Z"),
    )
    assert report["status"] == "invalid_export"
    assert report["invalid_rows"]["invalid_surplus_quantity_rows"] == 1
    assert report["invalid_rows"]["invalid_sales_quantity_rows"] == 1
    assert report["units"]["servings"]["valid_measured_outcomes"] == 1


def test_csv_reader_preserves_nonfinite_optional_quantity_instead_of_treating_it_as_null(tmp_path) -> None:
    row = outcome_row(1)
    row["actual_sales"] = "NaN"
    csv_path = tmp_path / "outcomes.csv"
    pd.DataFrame([row]).to_csv(csv_path, index=False)

    parsed = _read_outcome_csv(csv_path)
    report = validate_outcome_export(
        parsed,
        now=pd.Timestamp("2031-01-01T00:00:00Z"),
    )

    assert str(parsed.loc[0, "actual_sales"]) == "NaN"
    assert report["status"] == "invalid_export"
    assert report["invalid_rows"]["invalid_sales_quantity_rows"] == 1


def test_empty_export_is_no_data_not_valid_zero_outcome() -> None:
    report = validate_outcome_export(pd.DataFrame(columns=OUTCOME_REQUIRED_COLUMNS))
    assert report["status"] == "no_data"
    assert report["row_count"] == 0
    assert report["units"]["servings"]["zero_surplus_rows"] == 0
    assert report["units"]["servings"]["missing_outcome_rows"] == 0


def test_validation_rejects_duplicate_ids_and_inconsistent_units_without_echoing_values() -> None:
    row = outcome_row(1)
    report = validate_outcome_export(
        pd.DataFrame([row, {**row, "actual_surplus_quantity": 13}]),
        now=pd.Timestamp("2031-01-01T00:00:00Z"),
    )
    serialized = str(report)

    assert report["status"] == "invalid_export"
    assert report["duplicate_forecast_id_groups"] == 1
    assert row["forecast_id"] not in serialized
    assert row["donor_group"] not in serialized

    mismatch = outcome_row(2)
    mismatch["unit"] = "kg"
    unit_report = validate_outcome_export(
        pd.DataFrame([mismatch]),
        now=pd.Timestamp("2031-01-01T00:00:00Z"),
    )
    assert unit_report["invalid_rows"]["inconsistent_unit_rows"] == 1
    assert unit_report["units"]["servings"]["valid_measured_outcomes"] == 0


def test_validation_rejects_raw_pii_columns_and_non_pseudonymized_values() -> None:
    row = outcome_row(1)
    report = validate_outcome_export(
        pd.DataFrame([{**row, "donor_name": "Private Name"}]),
        now=pd.Timestamp("2031-01-01T00:00:00Z"),
    )
    assert report["status"] == "malformed_export"
    assert report["unexpected_columns"] == ["donor_name"]
    assert "Private Name" not in str(report)

    raw_identifier = outcome_row(2)
    raw_identifier["donor_group"] = "person@example.test"
    privacy_report = validate_outcome_export(
        pd.DataFrame([raw_identifier]),
        now=pd.Timestamp("2031-01-01T00:00:00Z"),
    )
    assert privacy_report["invalid_rows"]["invalid_pseudonym_rows"] == 1


def test_validation_reports_mixed_unit_readiness_without_combining_units() -> None:
    rows = [
        outcome_row(index, unit="servings" if index % 2 == 0 else "kg", surplus=0 if index % 2 == 0 else 0.0)
        for index in range(60)
    ]
    report = validate_outcome_export(
        pd.DataFrame(rows),
        now=pd.Timestamp("2031-01-01T00:00:00Z"),
    )

    assert report["unit_counts"] == {"servings": 30, "portions": 0, "kg": 30, "items": 0}
    assert report["units"]["servings"]["valid_measured_outcomes"] == 30
    assert report["units"]["kg"]["valid_measured_outcomes"] == 30
    assert report["units"]["servings"]["enough_samples"] is False
    assert report["units"]["kg"]["enough_samples"] is False


def test_validation_marks_unit_ready_only_with_minimum_valid_chronological_samples() -> None:
    rows = [outcome_row(index) for index in range(50)]
    report = validate_outcome_export(
        pd.DataFrame(rows),
        now=pd.Timestamp("2031-01-01T00:00:00Z"),
    )

    assert report["units"]["servings"]["chronological_split_counts"] == {
        "train": 30,
        "validation": 10,
        "test": 10,
    }
    assert report["units"]["servings"]["enough_samples"] is True


def test_pseudonymizer_outputs_only_hmac_groups_and_never_raw_ids() -> None:
    raw = pd.DataFrame([{
        **outcome_row(5),
        "forecast_id": "raw-forecast-id",
        "donor_id": "private-donor-id",
    }]).drop(columns=["donor_group"])
    sanitized = pseudonymize_export(raw, b"private-test-key-which-is-at-least-32-bytes")

    assert set(sanitized.columns) == set(OUTCOME_REQUIRED_COLUMNS)
    assert "raw-forecast-id" not in sanitized.to_csv(index=False)
    assert "private-donor-id" not in sanitized.to_csv(index=False)
    assert sanitized.loc[0, "forecast_id"].startswith("forecast_")
    assert sanitized.loc[0, "donor_group"].startswith("donor_")
    with pytest.raises(ValueError, match="at least 32 bytes"):
        pseudonymize_export(raw, b"short")

    blank_identifier = raw.copy()
    blank_identifier.loc[0, "donor_id"] = "  "
    with pytest.raises(ValueError, match="missing row identifiers"):
        pseudonymize_export(blank_identifier, b"private-test-key-which-is-at-least-32-bytes")
