from pathlib import Path

from .dataset import write_demo_dataset


if __name__ == "__main__":
    path = Path(__file__).parent / "data" / "demo_hotel_history.csv"
    dataset = write_demo_dataset(path)
    print(f"wrote {len(dataset)} synthetic rows to {path}")
