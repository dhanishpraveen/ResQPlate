import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PredictionInput = {
  food_category: string;
  restaurant_type: string;
  planned_quantity: number;
  expected_customers: number;
  historical_sales: number;
  historical_leftover: number;
  ready_at: string;
};

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
    input = await request.json() as PredictionInput;
  } catch {
    return response({ detail: "Request body must be valid JSON." }, 400);
  }

  try {
    const predictionResponse = await fetch(`${mlServiceUrl}/predict`, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const predictionBody = await predictionResponse.json();
    if (!predictionResponse.ok) return response({ detail: predictionBody.detail ?? "Prediction failed." }, 502);

    const { data: forecast, error: insertError } = await client
      .from("surplus_forecasts")
      .insert({
        donor_id: userData.user.id,
        ...input,
        predicted_quantity: predictionBody.predicted_quantity,
        uncertainty_lower: predictionBody.uncertainty.lower,
        uncertainty_upper: predictionBody.uncertainty.upper,
        unit: predictionBody.unit,
        model_version: predictionBody.model_version,
      })
      .select("*")
      .single();
    if (insertError) return response({ detail: insertError.message }, 500);
    return response({ forecast, prediction: predictionBody });
  } catch {
    return response({ detail: "The prediction service could not be reached." }, 502);
  }
});
