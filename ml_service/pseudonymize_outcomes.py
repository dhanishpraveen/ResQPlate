from __future__ import annotations

import argparse
import csv
import hashlib
import hmac
import os
from pathlib import Path

import pandas as pd

if __package__:
    from .evaluation import OUTCOME_REQUIRED_COLUMNS
else:
    from evaluation import OUTCOME_REQUIRED_COLUMNS

RAW_EXPORT_COLUMNS = frozenset(
    ("donor_id" if column == "donor_group" else column)
    for column in OUTCOME_REQUIRED_COLUMNS
)


def _pseudonym(key: bytes, purpose: str, value: str) -> str:
    digest = hmac.new(key, f"{purpose}:{value.strip()}".encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{purpose}_{digest}"


def pseudonymize_export(source: pd.DataFrame, key: bytes) -> pd.DataFrame:
    if len(key) < 32:
        raise ValueError("Pseudonymization key must contain at least 32 bytes.")
    missing = sorted(RAW_EXPORT_COLUMNS - set(source.columns))
    unexpected = sorted(set(source.columns) - RAW_EXPORT_COLUMNS)
    if missing or unexpected:
        details = []
        if missing:
            details.append(f"missing columns: {', '.join(missing)}")
        if unexpected:
            details.append(f"unexpected columns: {', '.join(unexpected)}")
        raise ValueError(f"Raw export schema is invalid ({'; '.join(details)}).")
    if (
        source["forecast_id"].isna().any()
        or source["donor_id"].isna().any()
        or source["forecast_id"].astype("string").str.strip().eq("").any()
        or source["donor_id"].astype("string").str.strip().eq("").any()
    ):
        raise ValueError("Raw export contains missing row identifiers.")

    sanitized = source.drop(columns=["donor_id"]).copy()
    sanitized["forecast_id"] = source["forecast_id"].astype(str).map(
        lambda value: _pseudonym(key, "forecast", value)
    )
    sanitized["donor_group"] = source["donor_id"].astype(str).map(
        lambda value: _pseudonym(key, "donor", value)
    )
    return sanitized.loc[:, list(OUTCOME_REQUIRED_COLUMNS)]


def _read_csv(path: Path) -> pd.DataFrame:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as file:
            header = next(csv.reader(file), None)
        if header is None:
            raise ValueError("Raw export is empty.")
        if len(header) != len(set(header)):
            raise ValueError("Raw export contains duplicate column headers.")
        return pd.read_csv(
            path,
            dtype={"forecast_id": "string", "donor_id": "string"},
            keep_default_na=False,
            na_values=[""],
        )
    except (OSError, UnicodeError, pd.errors.ParserError, csv.Error) as error:
        raise ValueError("Raw export could not be read as UTF-8 CSV.") from error


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Replace raw forecast and donor IDs with keyed pseudonyms without printing identifiers."
    )
    parser.add_argument("--input", required=True, type=Path, help="Protected raw CSV export.")
    parser.add_argument("--output", required=True, type=Path, help="New sanitized CSV path; must not exist.")
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        raise ValueError("Input and output paths must be different.")
    if args.output.exists():
        raise FileExistsError("Output already exists; choose a new sanitized output path.")
    key_value = os.environ.get("RESQPLATE_DONOR_PSEUDONYM_KEY")
    if key_value is None:
        raise ValueError("Set RESQPLATE_DONOR_PSEUDONYM_KEY to a private random value of at least 32 bytes.")
    sanitized = pseudonymize_export(_read_csv(args.input), key_value.encode("utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sanitized.to_csv(args.output, index=False)
    print(f"Sanitized rows written: {len(sanitized)}")


if __name__ == "__main__":
    main()
