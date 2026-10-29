# AI surplus workflow audit

## Current repository capabilities

- The application has React/Vite donor, NGO, volunteer, Supabase Auth,
  donation, pickup request, assignment, pickup, delivery, and NGO receipt
  workflows.
- The database has no historical preparation, sales, leftover, forecast,
  demand, allocation, notification, coordinate, or delivery-OTP entities.
- No notification transport or map provider exists in the repository. The
  Python service now includes a reproducible synthetic hotel dataset and a
  persisted demo artifact; it is not real donor history.
- The current delivery backend therefore cannot safely support the requested
  forecast-to-dispatch workflow without additive schema and trusted backend
  work.

## Implemented foundation

`ml_service/` contains a real Random Forest Regressor pipeline with:

- strict request validation and supported food categories;
- timezone-aware ready timestamps;
- a time-ordered evaluation split;
- MAE/RMSE and a simple baseline comparison in `python -m ml_service.train`;
- persisted joblib model artifacts loaded once per prediction request;
- tree-quantile uncertainty bounds;
- explicit `503` behavior when the model artifact has not been trained.

The included `ml_service/data/demo_hotel_history.csv` contains 1,200
deterministic synthetic development records. The model predicts
`leftover_quantity` from pre-service inputs only; actual sales and leftovers
are training targets/observations, not donor request features. It is not
evidence of production accuracy and must be replaced with real, unit-consistent
restaurant records before production forecasts are trusted.

## Required next backend work

The additive migration
`supabase/migrations/20261029133000_ai_forecasts_matching_notifications.sql`
now defines forecast records, NGO demand requirements, match recommendations,
quantity reservations, notification events, RLS, and an atomic,
idempotent donation reservation RPC. It has not been applied.

`ml_service/matching.py` and `POST /match` provide explainable ranking and
reject category, unit, deadline, travel-window, and zero-quantity failures.
Travel is never inferred when coordinates or a configured routing result are
missing.

The migration was applied to the configured Supabase project after explicit
approval. A follow-up additive migration makes obsolete donor-history fields
nullable and stores the meal period and training-data source. The donor
forecast UI now calls the `predict-surplus` Edge Function,
which verifies the authenticated donor role, calls FastAPI server-side, and
persists the returned forecast through RLS. The browser does not receive ML
service credentials.

To enable the feature in a deployed environment, deploy
`supabase/functions/predict-surplus/index.ts` and configure its
`ML_SERVICE_URL` secret to the reachable HTTPS FastAPI service URL. The
function is deployed to the configured ResQPlate project with JWT verification
enabled. The local example value `http://127.0.0.1:8000` is not reachable from
hosted Edge Functions. Hosted end-to-end prediction remains unverified until
a reachable ML service URL is stored and a donor-authenticated request
successfully persists a forecast.

CLI equivalents are:

```powershell
supabase functions deploy predict-surplus --project-ref ohfooorhpbciphscxteb
supabase secrets set ML_SERVICE_URL=https://<reachable-ml-service>/ --project-ref ohfooorhpbciphscxteb
```

Do not place the ML URL in a `VITE_` variable or browser bundle.

No hosted schema or production data was changed by this audit/foundation work.
