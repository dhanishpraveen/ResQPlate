from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import pandas as pd

if __package__:
    from .evaluation import (
        DEFAULT_UNIT,
        OUTCOME_REQUIRED_COLUMNS,
        evaluate_prepared_dataset,
        prepare_outcome_dataset,
        prepare_synthetic_demo_dataset,
        validate_outcome_export,
    )
else:
    from evaluation import (
        DEFAULT_UNIT,
        OUTCOME_REQUIRED_COLUMNS,
        evaluate_prepared_dataset,
        prepare_outcome_dataset,
        prepare_synthetic_demo_dataset,
        validate_outcome_export,
    )

DEFAULT_OUTCOMES_PATH = Path(__file__).parent / "data" / "forecast_outcomes.csv"
DEFAULT_DEMO_PATH = Path(__file__).parent / "data" / "demo_hotel_history.csv"


def _read_outcome_csv(path: Path) -> pd.DataFrame:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as file:
            header = next(csv.reader(file), None)
        if header is None:
            return pd.DataFrame()
        if len(header) != len(set(header)):
            raise ValueError("CSV contains duplicate column headers.")
        return pd.read_csv(path, keep_default_na=False, na_values=[""])
    except (OSError, UnicodeError, pd.errors.ParserError, csv.Error) as error:
        raise ValueError("CSV could not be read; check that it is UTF-8 CSV with a single header row and consistent columns.") from error


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate or evaluate surplus outcome exports without writing a model artifact."
    )
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument(
        "--outcomes-csv",
        nargs="?",
        const="__default__",
        help="Evaluate a local CSV export joined from surplus_forecasts and forecast_outcomes.",
    )
    source_group.add_argument(
        "--demo",
        action="store_true",
        help="Run a synthetic demonstration only; these results are not production accuracy.",
    )
    source_group.add_argument(
        "--validate-outcomes",
        nargs="?",
        const="__default__",
        help="Emit privacy-safe aggregate export validation; no model is fit.",
    )
    parser.add_argument("--unit", default=DEFAULT_UNIT, help="Evaluate exactly one quantity unit.")
    args = parser.parse_args()

    if args.validate_outcomes is not None:
        using_default_path = args.validate_outcomes == "__default__"
        source_path = DEFAULT_OUTCOMES_PATH if using_default_path else Path(args.validate_outcomes)
        if not source_path.is_file():
            report: dict[str, object] = {
                "status": "no_export",
                "row_count": 0,
                "data_availability": (
                    "No local outcome export is present. Migration application and live outcome availability were not checked."
                ),
                "privacy": "No donor names, contacts, pseudonyms, or raw identifiers are included.",
            }
        else:
            try:
                report = validate_outcome_export(_read_outcome_csv(source_path))
            except ValueError as error:
                report = {
                    "status": "malformed_export",
                    "row_count": None,
                    "error": str(error),
                    "privacy": "No row values or identifiers are included.",
                }
    elif args.demo:
        source_path = DEFAULT_DEMO_PATH
        prepared = prepare_synthetic_demo_dataset(pd.read_csv(source_path))
    else:
        using_default_path = args.outcomes_csv == "__default__"
        source_path = DEFAULT_OUTCOMES_PATH if using_default_path else Path(args.outcomes_csv)
        if source_path.is_file():
            prepared = prepare_outcome_dataset(_read_outcome_csv(source_path), args.unit)
        elif using_default_path:
            empty_source = pd.DataFrame(columns=OUTCOME_REQUIRED_COLUMNS)
            prepared = prepare_outcome_dataset(empty_source, args.unit)
        else:
            raise FileNotFoundError(
                "Outcome CSV not found. Export authorized forecast/outcome rows after the migration is applied."
            )

    if args.validate_outcomes is None:
        report = evaluate_prepared_dataset(prepared)
        if not source_path.is_file() and not args.demo:
            report["data_availability"] = (
                "No local forecast-outcome export is present. The migration is present locally; "
                "live application status and live outcome availability were not checked."
            )
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
