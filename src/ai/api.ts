import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import type { ForecastInput, ForecastPrediction } from "./data";
import type {
  IntelligenceInput,
  IntelligenceResult,
} from "../../supabase/functions/_shared/intelligence";

type Client = SupabaseClient<Database>;

export type IntelligenceScope = IntelligenceInput["scope"];
export type IntelligenceResponse = IntelligenceResult & {
  fallback_reason: string | null;
};

function isIntelligenceResponse(value: unknown): value is IntelligenceResponse {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<IntelligenceResponse>;
  const isFiniteNumber = (entry: unknown) =>
    typeof entry === "number" && Number.isFinite(entry);
  const prediction = result.predicted_surplus;
  const validPrediction =
    prediction === null ||
    Boolean(
      prediction &&
      typeof prediction === "object" &&
      isFiniteNumber(prediction.quantity) &&
      isFiniteNumber(prediction.lower) &&
      isFiniteNumber(prediction.upper) &&
      prediction.quantity >= 0 &&
      prediction.lower >= 0 &&
      prediction.lower <= prediction.upper &&
      typeof prediction.unit === "string" &&
      typeof prediction.forecasted_at === "string" &&
      typeof prediction.model_version === "string" &&
      prediction.source === "random_forest",
    );
  const validMatches =
    Array.isArray(result.matching_suggestions) &&
    result.matching_suggestions.every((match) =>
      Boolean(
        match &&
        typeof match === "object" &&
        typeof match.donation_id === "string" &&
        typeof match.food_name === "string" &&
        isFiniteNumber(match.quantity) &&
        typeof match.unit === "string" &&
        typeof match.expires_at === "string" &&
        typeof match.reason === "string",
      ),
    );
  const validUrgentDonations =
    Array.isArray(result.urgent_donations) &&
    result.urgent_donations.every((donation) =>
      Boolean(
        donation &&
        typeof donation === "object" &&
        typeof donation.donation_id === "string" &&
        typeof donation.food_name === "string" &&
        isFiniteNumber(donation.quantity) &&
        typeof donation.unit === "string" &&
        typeof donation.expires_at === "string" &&
        isFiniteNumber(donation.hours_to_expiry) &&
        donation.hours_to_expiry >= 0,
      ),
    );
  return (
    typeof result.summary === "string" &&
    ["low", "medium", "high", "unknown"].includes(result.risk_level ?? "") &&
    validPrediction &&
    typeof result.recommended_action === "string" &&
    (result.recommended_donation_time === null ||
      typeof result.recommended_donation_time === "string") &&
    Array.isArray(result.food_safety_notes) &&
    result.food_safety_notes.every((note) => typeof note === "string") &&
    validUrgentDonations &&
    validMatches &&
    typeof result.explanation === "string" &&
    Array.isArray(result.data_sources) &&
    result.data_sources.every((source) => typeof source === "string") &&
    Array.isArray(result.limitations) &&
    result.limitations.every((limitation) => typeof limitation === "string") &&
    (result.provider === "huggingface" || result.provider === "fallback") &&
    ["configured", "missing_token", "unavailable"].includes(
      result.configuration_status ?? "",
    ) &&
    (result.fallback_reason === null ||
      typeof result.fallback_reason === "string")
  );
}

export async function predictSurplus(
  client: Client,
  input: Omit<ForecastInput, "donor_id">,
): Promise<{
  prediction: ForecastPrediction;
  forecast: Database["public"]["Tables"]["surplus_forecasts"]["Row"];
}> {
  const { data, error } = await client.functions.invoke("predict-surplus", {
    body: input,
  });
  if (error) throw error;
  const result = data as {
    prediction?: Partial<ForecastPrediction>;
    forecast?: Database["public"]["Tables"]["surplus_forecasts"]["Row"];
  };
  if (!result.prediction || !result.forecast)
    throw new Error("The prediction gateway returned an incomplete response.");
  const prediction = result.prediction;
  if (
    typeof prediction.predicted_quantity !== "number" ||
    !prediction.uncertainty ||
    typeof prediction.uncertainty.lower !== "number" ||
    typeof prediction.uncertainty.upper !== "number" ||
    typeof prediction.unit !== "string" ||
    typeof prediction.model_version !== "string"
  ) {
    throw new Error("The prediction gateway returned an invalid response.");
  }
  return {
    forecast: result.forecast,
    prediction: prediction as ForecastPrediction,
  };
}

export async function getAiIntelligence(
  client: Client,
  scope: IntelligenceScope,
  forecastId?: string,
): Promise<IntelligenceResponse> {
  const { data, error } = await client.functions.invoke("ai-intelligence", {
    body: { scope, ...(forecastId ? { forecast_id: forecastId } : {}) },
  });
  if (error) throw error;
  if (!isIntelligenceResponse(data))
    throw new Error("The intelligence service returned an invalid response.");
  return data;
}
