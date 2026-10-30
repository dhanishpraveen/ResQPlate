import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";

type Client = SupabaseClient<Database>;

export type ForecastRow = Database["public"]["Tables"]["surplus_forecasts"]["Row"];
export type ForecastOutcome = Database["public"]["Tables"]["forecast_outcomes"]["Row"];
export type ForecastOutcomeInsert = Database["public"]["Tables"]["forecast_outcomes"]["Insert"];

export type ForecastPrediction = {
  predicted_quantity: number;
  uncertainty: { lower: number; upper: number };
  unit: string;
  model_version: string;
};

export type ForecastInput = {
  donor_id: string;
  food_category: string;
  restaurant_type: string;
  meal_period: "breakfast" | "lunch" | "dinner" | "banquet";
  planned_quantity: number;
  expected_customers: number;
  ready_at: string;
};

export type ForecastOutcomeFormValues = {
  actual_surplus_quantity: string;
  actual_sales: string;
  actual_customers: string;
  observed_at: string;
};

export function buildForecastOutcomeValues(
  forecast: Pick<ForecastRow, "id" | "ready_at" | "unit">,
  values: ForecastOutcomeFormValues,
  now = Date.now(),
): ForecastOutcomeInsert {
  const surplusQuantity = Number(values.actual_surplus_quantity);
  if (!values.actual_surplus_quantity.trim() || !Number.isFinite(surplusQuantity) || surplusQuantity < 0) {
    throw new Error("Enter a measured edible-surplus quantity of zero or more.");
  }

  const actualSales = values.actual_sales.trim() ? Number(values.actual_sales) : null;
  if (actualSales !== null && (!Number.isFinite(actualSales) || actualSales < 0)) {
    throw new Error("Actual sales must be a non-negative number.");
  }

  const actualCustomers = values.actual_customers.trim() ? Number(values.actual_customers) : null;
  if (actualCustomers !== null && (!Number.isInteger(actualCustomers) || actualCustomers < 0)) {
    throw new Error("Actual customers must be a non-negative whole number.");
  }

  const observedAt = new Date(values.observed_at);
  const readyAt = new Date(forecast.ready_at);
  if (!values.observed_at || Number.isNaN(observedAt.getTime())) {
    throw new Error("Enter when the actual surplus was measured.");
  }
  if (Number.isNaN(readyAt.getTime()) || observedAt <= readyAt) {
    throw new Error("The observation time must be after the forecast ready time.");
  }
  if (observedAt.getTime() > now) {
    throw new Error("The observation time cannot be in the future.");
  }

  return {
    forecast_id: forecast.id,
    actual_surplus_quantity: surplusQuantity,
    unit: forecast.unit,
    actual_sales: actualSales,
    actual_customers: actualCustomers,
    observed_at: observedAt.toISOString(),
  };
}

export async function createForecastOutcome(client: Client, input: ForecastOutcomeInsert) {
  const { data, error } = await client
    .from("forecast_outcomes")
    .insert(input)
    .select("*")
    .single();
  if (error?.code === "23505") {
    throw new Error("An outcome has already been recorded for this forecast.");
  }
  if (error) throw error;
  return data;
}

export async function listDonorForecastOutcomes(client: Client) {
  const { data, error } = await client
    .from("forecast_outcomes")
    .select("*")
    .order("observed_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createSurplusForecast(
  client: Client,
  input: ForecastInput,
  prediction: ForecastPrediction,
) {
  const { data, error } = await client
    .from("surplus_forecasts")
    .insert({
      ...input,
      predicted_quantity: prediction.predicted_quantity,
      uncertainty_lower: prediction.uncertainty.lower,
      uncertainty_upper: prediction.uncertainty.upper,
      unit: prediction.unit,
      model_version: prediction.model_version,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listDonorForecasts(client: Client) {
  const { data, error } = await client
    .from("surplus_forecasts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createNgoDemand(
  client: Client,
  input: Database["public"]["Tables"]["ngo_demand_requirements"]["Insert"],
) {
  const { data, error } = await client
    .from("ngo_demand_requirements")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listNgoDemands(client: Client) {
  const { data, error } = await client
    .from("ngo_demand_requirements")
    .select("*")
    .order("required_by", { ascending: true });
  if (error) throw error;
  return data;
}

export async function reserveDonationQuantity(
  client: Client,
  demandId: string,
  donationId: string,
  quantity: number,
  idempotencyKey: string,
) {
  const { data, error } = await client.rpc("reserve_donation_quantity", {
    p_demand_id: demandId,
    p_donation_id: donationId,
    p_quantity: quantity,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return data;
}
