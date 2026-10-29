from pathlib import Path

from fastapi import FastAPI, HTTPException

if __package__:
    from .model import FEATURE_COLUMNS, MODEL_VERSION, TARGET_UNIT, load_model, predict
    from .matching_schemas import MatchRequest
    from .schemas import PredictionRequest
else:
    from model import FEATURE_COLUMNS, MODEL_VERSION, TARGET_UNIT, load_model, predict
    from matching_schemas import MatchRequest
    from schemas import PredictionRequest

MODEL_PATH = Path(__file__).parent / "artifacts" / "surplus_model.joblib"
app = FastAPI(title="ResQPlate surplus prediction service", version=MODEL_VERSION)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": MODEL_PATH.is_file(),
        "model_version": MODEL_VERSION,
        "training_data": "synthetic_demo_hotel",
        "dataset_records": 1200,
        "target": "leftover_quantity",
        "unit": TARGET_UNIT,
        "features": list(FEATURE_COLUMNS),
    }


@app.post("/predict")
def predict_surplus(request: PredictionRequest) -> dict[str, object]:
    try:
        model, model_version, unit = load_model(MODEL_PATH)
    except (FileNotFoundError, KeyError, OSError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    payload = request.model_dump()
    ready_at = payload.pop("ready_at")
    payload["restaurant_type"] = payload["restaurant_type"]
    payload["day_of_week"] = ready_at.weekday()
    payload["ready_hour"] = ready_at.hour
    payload = {column: payload[column] for column in FEATURE_COLUMNS}
    result = predict(model, payload, model_version=model_version)
    return {
        "predicted_quantity": result.quantity,
        "uncertainty": {"lower": result.lower_bound, "upper": result.upper_bound},
        "unit": unit or TARGET_UNIT,
        "model_version": result.model_version,
        "input_features": payload,
    }


@app.post("/match")
def match_candidates(request: MatchRequest) -> dict[str, object]:
    if __package__:
        from .matching import rank_matches
    else:
        from matching import rank_matches

    results = rank_matches(request.to_domain(), [candidate.to_domain() for candidate in request.candidates])
    return {
        "matches": [
            {
                "candidate_id": result.candidate_id,
                "feasible": result.feasible,
                "allocatable_quantity": result.allocatable_quantity,
                "score": result.score,
                "explanation": result.explanation,
            }
            for result in results
        ]
    }
