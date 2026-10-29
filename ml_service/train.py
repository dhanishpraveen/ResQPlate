from pathlib import Path

from sklearn.metrics import mean_absolute_error, mean_squared_error

from .model import FEATURE_COLUMNS, MODEL_VERSION, make_development_dataset, save_model, train_model


def main() -> None:
    dataset = make_development_dataset()
    split = int(len(dataset) * 0.8)
    training, evaluation = dataset.iloc[:split], dataset.iloc[split:]
    model = train_model(training)
    predictions = model.predict(evaluation[list(FEATURE_COLUMNS)])
    baseline = evaluation["planned_quantity"] - evaluation["historical_sales"] + evaluation["historical_leftover"]
    mae = mean_absolute_error(evaluation["surplus_quantity"], predictions)
    rmse = mean_squared_error(evaluation["surplus_quantity"], predictions) ** 0.5
    baseline_mae = mean_absolute_error(evaluation["surplus_quantity"], baseline)
    artifact = Path(__file__).parent / "artifacts" / "surplus_model.joblib"
    save_model(model, artifact)
    print(f"model_version={MODEL_VERSION}")
    print(f"dataset=synthetic_development_only rows={len(dataset)}")
    print(f"random_forest_mae={mae:.3f} random_forest_rmse={rmse:.3f}")
    print(f"baseline_mae={baseline_mae:.3f}")
    print(f"artifact={artifact}")


if __name__ == "__main__":
    main()
