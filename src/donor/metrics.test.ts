import { describe, expect, it } from "vitest";
import { calculateDonorImpact, monthlyCompletedSummary } from "./metrics";
import type { CompletedImpactRow } from "./data";

const row = (unit: CompletedImpactRow["unit"], quantity: number, completedAt: string): CompletedImpactRow => ({
  donation_id: `${unit}-${quantity}`,
  cuisine_type: "Indian",
  unit,
  quantity,
  completed_at: completedAt,
});

describe("verified donor impact", () => {
  it("counts explicit servings and kilograms only, without estimating people or emissions", () => {
    const impact = calculateDonorImpact([
      row("servings", 12, "2030-01-10T12:00:00Z"),
      row("portions", 4, "2030-01-10T12:00:00Z"),
      row("kg", 6.5, "2030-01-10T12:00:00Z"),
      row("items", 20, "2030-01-10T12:00:00Z"),
    ]);
    expect(impact).toEqual({ mealsDonated: 12, foodSavedKg: 6.5, peopleFed: null, co2ReducedKg: null });
  });

  it("groups completed donation counts and kg quantities into the selected UTC window", () => {
    const months = monthlyCompletedSummary([
      row("kg", 2, "2024-12-10T12:00:00Z"),
      row("kg", 3, "2025-01-10T12:00:00Z"),
      row("servings", 8, "2025-01-10T12:00:00Z"),
    ], 6, new Date("2025-03-15T00:00:00Z"));
    expect(months.map((month) => month.month)).toEqual(["2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03"]);
    expect(months.find((month) => month.month === "2024-12")?.kilograms).toBe(2);
    expect(months.find((month) => month.month === "2025-01")?.kilograms).toBe(3);
    expect(months.find((month) => month.month === "2025-01")?.completedDonations).toBe(2);
  });
});
