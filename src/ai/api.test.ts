import { describe, expect, it, vi } from "vitest";
import { getAiIntelligence, predictSurplus } from "./api";

const validResponse = {
  summary: "Summary",
  risk_level: "unknown",
  predicted_surplus: null,
  recommended_action: "Review listings",
  recommended_donation_time: null,
  food_safety_notes: ["Maintain safe temperature controls."],
  urgent_donations: [],
  matching_suggestions: [],
  explanation: "Based on current records.",
  data_sources: ["RLS-authorized donation listings"],
  limitations: ["Pickup feasibility must be confirmed."],
  provider: "fallback",
  configuration_status: "missing_token",
  fallback_reason: "missing_token",
};

describe("AI intelligence client API", () => {
  it("preserves the existing Random Forest prediction gateway contract", async () => {
    const savedForecast = { id: "forecast-1", predicted_quantity: 8, unit: "servings" };
    const prediction = {
      predicted_quantity: 8,
      uncertainty: { lower: 2, upper: 14 },
      unit: "servings",
      model_version: "rf-demo-hotel-v2",
    };
    const invoke = vi.fn().mockResolvedValue({
      data: { forecast: savedForecast, prediction },
      error: null,
    });

    await expect(predictSurplus({ functions: { invoke } } as never, {
      food_category: "prepared_meal",
      restaurant_type: "restaurant",
      meal_period: "dinner",
      planned_quantity: 20,
      expected_customers: 16,
      ready_at: "2030-01-01T18:00:00.000Z",
    })).resolves.toEqual({ forecast: savedForecast, prediction });
    expect(invoke).toHaveBeenCalledWith("predict-surplus", {
      body: expect.objectContaining({ food_category: "prepared_meal" }),
    });
  });

  it("invokes the authenticated function with only the requested scope and forecast ID", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ data: validResponse, error: null });
    const client = { functions: { invoke } } as never;

    await expect(
      getAiIntelligence(client, "donor_forecast", "forecast-uuid"),
    ).resolves.toEqual(validResponse);
    expect(invoke).toHaveBeenCalledWith("ai-intelligence", {
      body: { scope: "donor_forecast", forecast_id: "forecast-uuid" },
    });
  });

  it("rejects malformed nested model data and propagates function errors", async () => {
    const invalidInvoke = vi.fn().mockResolvedValue({
      data: { ...validResponse, predicted_surplus: { quantity: "many" } },
      error: null,
    });
    await expect(
      getAiIntelligence(
        { functions: { invoke: invalidInvoke } } as never,
        "donor_dashboard",
      ),
    ).rejects.toThrow("invalid response");

    const functionError = new Error("function unavailable");
    const failedInvoke = vi
      .fn()
      .mockResolvedValue({ data: null, error: functionError });
    await expect(
      getAiIntelligence(
        { functions: { invoke: failedInvoke } } as never,
        "ngo_dashboard",
      ),
    ).rejects.toBe(functionError);
  });
});
