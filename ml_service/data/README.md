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
