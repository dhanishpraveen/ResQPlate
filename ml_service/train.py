from pathlib import Path

import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error

from .model import FEATURE_COLUMNS, MODEL_VERSION, prepare_dataset, save_model, train_model


def main(dataset_path: Path | None = None) -> None:
    source_path = dataset_path or Path(__file__).parent / "data" / "demo_hotel_history.csv"
    if not source_path.is_file():
        raise FileNotFoundError(f"Dataset not found: {source_path}. Run python -m ml_service.generate_demo_data first.")
    dataset = prepare_dataset(pd.read_csv(source_path))
    split = int(len(dataset) * 0.8)
    training, evaluation = dataset.iloc[:split], dataset.iloc[split:]
    model = train_model(training)
    predictions = model.predict(evaluation[list(FEATURE_COLUMNS)])
    baseline = evaluation["planned_quantity"] * 0.08
    mae = mean_absolute_error(evaluation["leftover_quantity"], predictions)
    rmse = mean_squared_error(evaluation["leftover_quantity"], predictions) ** 0.5
    baseline_mae = mean_absolute_error(evaluation["leftover_quantity"], baseline)
    artifact = Path(__file__).parent / "artifacts" / "surplus_model.joblib"
    save_model(model, artifact)
    print(f"model_version={MODEL_VERSION}")
    print(f"dataset=synthetic_demo_hotel rows={len(dataset)}")
    print(f"random_forest_mae={mae:.3f} random_forest_rmse={rmse:.3f}")
    print(f"baseline_mae={baseline_mae:.3f}")
    print(f"artifact={artifact}")


if __name__ == "__main__":
    main()
