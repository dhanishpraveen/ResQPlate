import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";

type Client = SupabaseClient<Database>;

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
  planned_quantity: number;
  expected_customers: number;
  historical_sales: number;
  historical_leftover: number;
  ready_at: string;
};

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
