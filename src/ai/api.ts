import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import type { ForecastInput, ForecastPrediction } from "./data";

type Client = SupabaseClient<Database>;

export async function predictSurplus(client: Client, input: Omit<ForecastInput, "donor_id">): Promise<{ prediction: ForecastPrediction; forecast: Database["public"]["Tables"]["surplus_forecasts"]["Row"] }> {
  const { data, error } = await client.functions.invoke("predict-surplus", { body: input });
  if (error) throw error;
  const result = data as { prediction?: Partial<ForecastPrediction>; forecast?: Database["public"]["Tables"]["surplus_forecasts"]["Row"] };
  if (!result.prediction || !result.forecast) throw new Error("The prediction gateway returned an incomplete response.");
  const prediction = result.prediction;
  if (
    typeof prediction.predicted_quantity !== "number"
    || !prediction.uncertainty
    || typeof prediction.uncertainty.lower !== "number"
    || typeof prediction.uncertainty.upper !== "number"
    || typeof prediction.unit !== "string"
    || typeof prediction.model_version !== "string"
  ) {
    throw new Error("The prediction gateway returned an invalid response.");
  }
  return { forecast: result.forecast, prediction: prediction as ForecastPrediction };
}
