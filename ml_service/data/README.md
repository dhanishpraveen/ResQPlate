# Demo hotel history

`demo_hotel_history.csv` is a reproducible **synthetic development dataset**.
The five hotel names are fictional, and the rows do not represent real
customers, hotels, or personal information.

The dataset contains 1,200 hotel-day food records in servings. The target
`leftover_quantity` is generated from plausible preparation, demand, meal
period, and customer-arrival relationships. It is suitable for demonstrating
the ResQPlate prediction pipeline only; it is not evidence of production
accuracy.

Regenerate it from the repository root with:

```powershell
python -m ml_service.generate_demo_data
```

## Forecast-outcome evaluation

Real evaluation uses a sanitized CSV export joining `surplus_forecasts` to
`forecast_outcomes`. Its exact columns and meanings are:

| Column | Meaning | Example |
|---|---|---|
| `forecast_id` | HMAC pseudonym for the forecast UUID; used only for duplicate detection | `forecast_` followed by 64 lowercase hex characters |
| `donor_group` | HMAC pseudonym for the donor UUID; used only to count unseen donor groups | `donor_` followed by 64 lowercase hex characters |
| `forecast_unit` | Unit on the linked forecast row | `servings` |
| `unit` | Unit recorded with measured outcome; must equal `forecast_unit` | `servings` |
| `food_category` | Forecast input category | `prepared_meal` |
| `restaurant_type` | Forecast input restaurant type | `restaurant` |
| `meal_period` | Forecast input meal period | `lunch` |
| `planned_quantity` | Forecast planned preparation quantity, in `forecast_unit` | `100` |
| `expected_customers` | Forecast-time expected customer/order count | `70` |
| `ready_at` | Forecast planned ready timestamp, with timezone | `2030-01-01T12:00:00Z` |
| `observed_at` | Outcome measurement timestamp; must be after `ready_at` and not in the future | `2030-01-01T14:00:00Z` |
| `actual_surplus_quantity` | Measured edible surplus from `forecast_outcomes`; zero is a valid observation | `0` |
| `actual_sales` | Optional observed sales quantity in the same unit | blank or `80` |
| `actual_customers` | Optional observed customer/order count | blank or `65` |

Illustrative sanitized CSV row (format example only, not a real observation):

```csv
forecast_id,donor_group,forecast_unit,unit,food_category,restaurant_type,meal_period,planned_quantity,expected_customers,ready_at,observed_at,actual_surplus_quantity,actual_sales,actual_customers
forecast_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,donor_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,servings,servings,prepared_meal,restaurant,lunch,100,70,2030-01-01T12:00:00Z,2030-01-01T14:00:00Z,0,80,65
```

The evaluator rejects missing/extra columns, malformed pseudonyms, duplicate
forecast pseudonyms, missing required forecast fields, invalid/negative or
non-finite quantities, inconsistent units, and invalid observation times.
Validation reports only aggregate counts, fixed unit names, dates, and split
readiness. It never echoes CSV row values, donor pseudonyms, or raw
identifiers. A missing outcome is a null outcome row; it is not the same as a
valid measured `actual_surplus_quantity` of zero. Non-negative measured
quantities are not capped at `planned_quantity`: that field is a forecast-time
input, not a measured total-production amount, and capping would discard
possible underforecast outcomes.

The local outcome migration is
`supabase/migrations/20261030023000_forecast_outcome_records.sql`. Do not
assume its history entry is present. Read-only inspection of the configured
hosted project did not list this migration, but the table listing did show
`public.forecast_outcomes` with RLS enabled, the expected columns, primary key,
foreign key, and original non-negative checks; it reported zero rows. This is
a migration-history/schema conflict, not evidence that the table is missing.
The table listing did not include policy definitions or grants, so those still
require explicit verification. Do not replay the create-table migration or
push migrations until an operator reconciles the migration ledger against the
live schema. Do not use a service-role credential in a browser or bypass RLS.

The forward migration
`supabase/migrations/20261030041800_forecast_outcome_finite_numeric_checks.sql`
adds checks rejecting PostgreSQL numeric `NaN`, `Infinity`, and `-Infinity`
for measured surplus and non-NULL sales. Zero remains valid and optional
sales may remain NULL. It must only be applied after confirming that the
existing outcome table matches the expected baseline. Its comment contains a
verification query for a disposable PostgreSQL 17 database; it has not been
run against hosted data.

For a protected raw export, use exactly these columns:

`forecast_id`, `donor_id`, `forecast_unit`, `unit`, `food_category`,
`restaurant_type`, `meal_period`, `planned_quantity`, `expected_customers`,
`ready_at`, `observed_at`, `actual_surplus_quantity`, `actual_sales`,
`actual_customers`.

The current app has no export button or CSV export path. The smallest safe
donor-scoped implementation is to call the existing
`listDonorForecasts(supabase)` and `listDonorForecastOutcomes(supabase)` helpers
with the signed-in donor's normal Supabase client, then join the results in
memory on forecast `id` = outcome `forecast_id`. Both table reads remain
protected by their RLS policies; do not use a service-role client or accept a
donor ID supplied by the browser as authorization. The current hand-written
TypeScript database type does not describe the FK relationship for embedded
PostgREST selects, so the two existing typed queries avoid relying on an
untyped embedded join.

For each donor-owned forecast, map `id` to `forecast_id`, `unit` to
`forecast_unit`, retain `donor_id` only in the protected intermediate CSV, and
flatten the matching outcome fields. If there is no matching outcome, write
empty fields for `unit`, `observed_at`, `actual_surplus_quantity`,
`actual_sales`, and `actual_customers`; do not turn an absent row into a
measured zero. The current per-donor app reads are not a cross-donor export
path. Any aggregate export must be a separately approved, explicitly
authorized process. Do not include names, email, phone, pickup/request/
delivery fields, or prediction/confirmation/hand-over fields.

Store the raw CSV in a protected local location. Set a private random
`RESQPLATE_DONOR_PSEUDONYM_KEY` of at least 32 bytes in the process
environment (never commit, print, or share it). The helper HMAC-pseudonymizes
both IDs and writes only the exact sanitized schema to a new file:

```powershell
python -m ml_service.pseudonymize_outcomes --input .\private\raw_outcomes.csv --output .\ml_service\data\forecast_outcomes.csv
```

The helper does not overwrite the source or an existing destination, and
prints only the output row count. Protect the raw export and key; remove the
raw export under your organization's data-handling procedure after
pseudonymization. Then validate before evaluating:

```powershell
python -m ml_service.evaluate --validate-outcomes .\ml_service\data\forecast_outcomes.csv
```

Validation reports missing values by required column, duplicate counts,
supported unit counts, observation date ranges, invalid-row counts, and
chronological 60/20/20 sample counts/readiness per unit. It distinguishes
`no_export`, `no_data`, `valid_export`, `invalid_export`, and
`malformed_export`. Resolve every validation error before evaluation.

Run the evaluator for exactly one unit:

```powershell
python -m ml_service.evaluate --outcomes-csv .\ml_service\data\forecast_outcomes.csv --unit servings
```

Run separately for other units, such as:

```powershell
python -m ml_service.evaluate --outcomes-csv .\ml_service\data\forecast_outcomes.csv --unit kg
```

The evaluator uses chronological train/validation/test splits, compares a
training-set historical mean and fixed 8% surplus-rate baseline against Ridge
regression and the existing Random Forest, and reports MAE/RMSE, split date
ranges, and unseen-donor test counts when possible. It never writes a model
artifact. Insufficient splits report a limitation instead of fitting models.
Each unit is evaluated independently; units are never treated as
interchangeable.

To run only a labeled synthetic demonstration:

```powershell
python -m ml_service.evaluate --demo
```

Synthetic metrics are not production accuracy. The `forecast_outcomes`
migration and local TypeScript/data integration do not establish that the
migration has been applied to Supabase or that real outcome records exist.
