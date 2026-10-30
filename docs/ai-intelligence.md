# AI Intelligence

## Architecture

ResQPlate uses a hybrid architecture. The existing Random Forest FastAPI
service remains the only source of numerical surplus forecasts. The existing
`predict-surplus` Edge Function authenticates donors, calls `ML_SERVICE_URL`,
and stores the estimate and model provenance in `surplus_forecasts`. Forecast
outcomes remain separate append-only measured observations; this feature does
not use donor confirmation, predicted quantity, delivery quantity, or sales as
measured surplus.

The new `ai-intelligence` Edge Function verifies the Supabase session and
trusted `user_profiles.role`, then reloads the relevant records using the
authenticated client and existing RLS/RPC access. It returns a validated
structured result combining verified facts, the saved Random Forest result
when requested, deterministic recommendations, and optional language-model
wording. The language model cannot call tools, write records, select new
quantities, schedule pickups, or change the deterministic candidate action.

`supabase/functions/_shared/intelligence.ts` contains the deterministic
fallback, response validation, role-scope guard, and provider adapter. NGO
availability is loaded through `list_available_donations`, which only returns
unexpired donations marked available to an authenticated NGO. The function
also excludes donations with this NGO's pending, confirmed, or picked-up
request. Requirement matches require a recorded active requirement, exact
category text in the food name/cuisine, matching unit, enough requirement
quantity, and a required-by time no later than expiry. There is no inferred
distance, pickup feasibility, volunteer availability, or NGO capacity.

The donor dashboard uses current donation status and expiry for urgency. The
forecast screen uses the saved model forecast; risk is a transparent planning
heuristic (predicted surplus / planned quantity: high at 50% or above, medium
at 20% or above, otherwise low). Donation urgency is high within 6 hours of
expiry, medium within 24 hours, and low after 24 hours. These labels are
heuristics, not probabilities. Model-provided per-tree 10th/90th percentile
bounds are displayed as a model range, not a calibrated confidence interval.

## Hugging Face

The integration uses Hugging Face Inference Providers' current OpenAI-style
chat-completions endpoint:

`https://router.huggingface.co/v1/chat/completions`

The default model identifier is `openai/gpt-oss-120b:cheapest`. Hugging Face's
current Inference Providers documentation lists `openai/gpt-oss-120b` as a
conversational model and documents the `:cheapest` provider-selection policy.
The model was selected for instruction-following and structured chat
responses; it is not assumed to be free. Actual provider availability,
structured-output support, price, latency, and quota depend on current provider
routing and the project's Hugging Face account. Override `HF_MODEL` only with
a model currently listed as available for chat completion in that account.
If the selected model/provider is unavailable or rejects JSON mode, the
function returns the deterministic fallback.

The LLM receives only the minimum fields needed to phrase a recommendation:
the computed summary/action, model facts when applicable, general food-safety
notes, and an aggregate match count. It does not receive donation IDs, donor or
NGO names, contact details, addresses, pickup instructions, auth tokens, or
free-text food names. Output is bounded and checked against the verified
candidate vocabulary and numeric facts. Unsupported/malformed output is
discarded.

## Environment

Browser variables remain limited to `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in the root `.env.local`. Never prefix a
provider token with `VITE_`.

| Variable             | Location                                           | Purpose                                                                                                                       |
| -------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `HF_TOKEN`           | Supabase Edge Function secret / local function env | Fine-grained Hugging Face token with Inference Providers permission. Optional; without it, deterministic insights still work. |
| `HF_MODEL`           | Edge Function secret / local function env          | Model ID; defaults to `openai/gpt-oss-120b:cheapest`.                                                                         |
| `AI_ALLOWED_ORIGINS` | Edge Function secret / local function env          | Optional comma-separated exact browser origins. Local Vite origins are allowed by default.                                    |
| `SUPABASE_URL`       | Supabase Edge runtime                              | Supabase project URL injected by the platform/local CLI.                                                                      |
| `SUPABASE_ANON_KEY`  | Supabase Edge runtime                              | Public/anon key used with the caller's Authorization header and RLS; no service-role key is used.                             |
| `ML_SERVICE_URL`     | Existing `predict-surplus` Edge Function secret    | Existing reachable HTTPS ML service URL. Not used by `ai-intelligence`.                                                       |

The tracked placeholder file is `supabase/functions/.env.example`. Copy it to
`supabase/functions/.env.local` for local work, add the token only to that
ignored local file, and do not commit it. Create a fine-grained token in Hugging
Face settings with **Make calls to Inference Providers** permission. Never put
the token in frontend configuration, logs, request bodies, or version control.

## Local Development

1. Start the local Supabase stack using the repository's approved development
   setup (`supabase start`).
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the local
   stack in the root `.env.local`.
3. Copy `supabase/functions/.env.example` to
   `supabase/functions/.env.local`; optionally set `HF_TOKEN` and `HF_MODEL`.
4. Serve the function locally with
   `supabase functions serve ai-intelligence --env-file supabase/functions/.env.local`.
5. Run the Vite app and authenticate with a donor or NGO account. Without an
   HF token, the panel reports the configuration status and displays fallback
   recommendations.

## Deployment

Deployment is deliberately manual and was not performed for this change. On an
approved Supabase project, set the server-side secrets using the project's
secret-management workflow, for example:

```powershell
supabase secrets set HF_TOKEN=<fine-grained-token> HF_MODEL=openai/gpt-oss-120b:cheapest AI_ALLOWED_ORIGINS=https://<approved-app-origin>
supabase functions deploy ai-intelligence
```

Do not pass a real token in a committed script or documentation. Verify the
Edge Function's JWT verification is enabled, configure its exact production
origin, and test donor/NGO role denials, RLS ownership, missing-token fallback,
provider quota errors, and refresh throttling in a development project before
production release. The existing `predict-surplus` function and FastAPI
service have their own deployment and `ML_SERVICE_URL` requirements; this
integration does not deploy or alter them.

## Reliability, Security, And Limitations

- The Edge Function checks authentication and role independently of browser
  routing and uses the caller's JWT with the anon key. It does not use a
  service-role key.
- Requests are scope-only, size bounded, authenticated, and validated. The
  per-user cooldown is 15 seconds with at most four requests per rolling
  minute per Edge Function instance. This in-memory limiter is best-effort,
  not distributed; a production deployment needing strict global quotas must
  add a shared gateway/database rate limiter.
- Provider calls have an 8-second abort timeout. Missing token, provider
  errors/quota, timeout, malformed JSON, unsupported claims, and rate limits
  use deterministic results without changing application data.
- Forecast model training data is synthetic hotel demo data. No production
  accuracy, real-world confidence, or personalized donor history is claimed.
- Food-safety text is general operational guidance, not a food safety
  determination. Follow local rules and verified handling instructions.
- NGO matching only uses currently stored category, unit, quantity, expiry,
  active requirements, and this NGO's active request status. The schema does
  not establish travel time, NGO capacity, or available volunteers.
- No schema migration was added or applied. Forecast history and measured
  outcome collection/evaluation code remain unchanged.
- Hugging Face model access and charges require a configured token/account and
  depend on provider availability. No live external request was made for this
  implementation.

## Tests

Run the frontend suite and build/typecheck:

```powershell
npm test
npm run typecheck
npm run build
```

Run relevant Python ML tests and dependency compatibility checks:

```powershell
python -m pytest ml_service
python -m pip check
```

AI-specific tests cover model provenance, role-scope decisions, expired and
claimed/completed donation exclusion, feasible requirement matches,
Hugging Face success/failure/timeout, missing-token and malformed-output
fallbacks, unsupported claims, payload minimization, frontend response
validation, and panel configuration/unavailable states. Live Supabase RLS and
Hugging Face provider behavior still require development credentials and are
not established by unit tests.
