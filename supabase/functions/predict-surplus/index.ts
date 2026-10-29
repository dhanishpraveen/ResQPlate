import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PredictionInput = {
  food_category: string;
  restaurant_type: string;
  meal_period: string;
  planned_quantity: number;
  expected_customers: number;
  ready_at: string;
};

const allowedCategories = new Set(["bakery", "prepared_meal", "produce", "salad", "sandwich"]);
const allowedMealPeriods = new Set(["breakfast", "lunch", "dinner", "banquet"]);
const upstreamTimeoutMs = 10_000;

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Origin": "*",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function isPredictionInput(value: unknown): value is PredictionInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<PredictionInput>;
  return typeof input.food_category === "string"
    && allowedCategories.has(input.food_category.trim().toLowerCase())
    && typeof input.restaurant_type === "string"
    && input.restaurant_type.trim().length > 0
    && input.restaurant_type.trim().length <= 80
    && typeof input.meal_period === "string"
    && allowedMealPeriods.has(input.meal_period.trim().toLowerCase())
    && typeof input.planned_quantity === "number"
    && Number.isFinite(input.planned_quantity)
    && input.planned_quantity > 0
    && input.planned_quantity <= 100_000
    && typeof input.expected_customers === "number"
    && Number.isInteger(input.expected_customers)
    && input.expected_customers >= 0
    && input.expected_customers <= 100_000
    && typeof input.ready_at === "string"
    && Number.isFinite(Date.parse(input.ready_at));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ detail: "Only POST is supported." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return response({ detail: "Authentication is required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const mlServiceUrl = Deno.env.get("ML_SERVICE_URL")?.replace(/\/+$/, "");
  if (!supabaseUrl || !anonKey || !mlServiceUrl) {
    return response({ detail: "Prediction service is not configured on the server." }, 503);
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return response({ detail: "Authentication could not be verified." }, 401);

  const { data: profile, error: profileError } = await client
    .from("user_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) return response({ detail: profileError.message }, 500);
  if (profile?.role !== "donor") return response({ detail: "A donor account is required." }, 403);

  let input: PredictionInput;
  try {
    const body: unknown = await request.json();
    if (!isPredictionInput(body)) return response({ detail: "Invalid prediction inputs." }, 422);
    input = {
      ...body,
      food_category: body.food_category.trim().toLowerCase(),
      restaurant_type: body.restaurant_type.trim().toLowerCase(),
      meal_period: body.meal_period.trim().toLowerCase(),
    };
  } catch (error) {
    console.error("Prediction request parsing failed", error instanceof Error ? error.message : "unknown error");
    return response({ detail: "Request body must be valid JSON." }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);
  try {
    const predictionResponse = await fetch(`${mlServiceUrl}/predict`, {
      body: JSON.stringify(input),
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });
    let predictionBody: Record<string, unknown>;
    try {
      predictionBody = await predictionResponse.json() as Record<string, unknown>;
    } catch (error) {
      console.error("Prediction service returned invalid JSON", error instanceof Error ? error.message : "unknown error");
      return response({ detail: "The prediction service returned an invalid response." }, 502);
    }
    if (!predictionResponse.ok) {
      console.error("Prediction service rejected request", predictionResponse.status);
      return response({ detail: typeof predictionBody.detail === "string" ? predictionBody.detail : "Prediction failed." }, 502);
    }
    const uncertainty = predictionBody.uncertainty;
    if (
      typeof predictionBody.predicted_quantity !== "number"
      || !Number.isFinite(predictionBody.predicted_quantity)
      || !uncertainty
      || typeof uncertainty !== "object"
      || typeof (uncertainty as { lower?: unknown }).lower !== "number"
      || typeof (uncertainty as { upper?: unknown }).upper !== "number"
      || typeof predictionBody.unit !== "string"
      || typeof predictionBody.model_version !== "string"
    ) {
      console.error("Prediction service returned an incomplete prediction");
      return response({ detail: "The prediction service returned an invalid prediction." }, 502);
    }

    const { data: forecast, error: insertError } = await client
      .from("surplus_forecasts")
      .insert({
        donor_id: userData.user.id,
        ...input,
        predicted_quantity: predictionBody.predicted_quantity,
        uncertainty_lower: (uncertainty as { lower: number }).lower,
        uncertainty_upper: (uncertainty as { upper: number }).upper,
        unit: predictionBody.unit,
        model_version: predictionBody.model_version,
        training_data_source: "synthetic_demo_hotel",
      })
      .select("*")
      .single();
    if (insertError) {
      console.error("Forecast persistence failed", insertError.code);
      return response({ detail: "The prediction was generated but could not be saved." }, 500);
    }
    return response({ forecast, prediction: predictionBody });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error("Prediction service request timed out");
      return response({ detail: "The prediction service timed out. Please try again." }, 504);
    }
    console.error("Prediction service request failed", error instanceof Error ? error.message : "unknown error");
    return response({ detail: "The prediction service could not be reached." }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
