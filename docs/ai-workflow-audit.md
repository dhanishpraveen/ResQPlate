# AI surplus workflow audit

## Current repository capabilities

- The application has React/Vite donor, NGO, volunteer, Supabase Auth,
  donation, pickup request, assignment, pickup, delivery, and NGO receipt
  workflows.
- The database has no historical preparation, sales, leftover, forecast,
  demand, allocation, notification, coordinate, or delivery-OTP entities.
- No Python service, Edge Function, notification transport, map provider, or
  usable historical dataset exists in the repository.
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

The included dataset is deterministic synthetic development data only. It is
not evidence of production accuracy and must be replaced with real,
unit-consistent restaurant records before forecasts are shown to users.

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
approval. The donor forecast UI now calls the `predict-surplus` Edge Function,
which verifies the authenticated donor role, calls FastAPI server-side, and
persists the returned forecast through RLS. The browser does not receive ML
service credentials.

To enable the feature in a deployed environment, deploy
`supabase/functions/predict-surplus/index.ts` and configure its
`ML_SERVICE_URL` secret to the reachable FastAPI service URL. The current
repository still has no notification transport or deployed gateway, so local
source integration is complete but hosted end-to-end prediction remains
unverified until those services are deployed.

No hosted schema or production data was changed by this audit/foundation work.
