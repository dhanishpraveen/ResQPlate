import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildFallbackIntelligence,
  generateIntelligence,
  intelligenceRoleAllowed,
  type ForecastFacts,
  type IntelligenceDonation,
  type IntelligenceInput,
} from "../_shared/intelligence.ts";

const DEFAULT_MODEL = "openai/gpt-oss-120b:cheapest";
const USER_COOLDOWN_MS = 15_000;
const USER_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 4;
const requestsByUser = new Map<string, number[]>();

function allowedOrigins() {
  return (Deno.env.get("AI_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(origin: string | null): HeadersInit {
  const origins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...allowedOrigins(),
  ]);
  return {
    ...(origin && origins.has(origin)
      ? { "Access-Control-Allow-Origin": origin }
      : !origin
        ? { "Access-Control-Allow-Origin": "*" }
        : {}),
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Access-Control-Request-Headers",
  };
}

function response(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function tooManyRequests(userId: string, now: number) {
  if (requestsByUser.size > 2_000) {
    for (const [id, timestamps] of requestsByUser) {
      if (
        !timestamps.length ||
        now - timestamps[timestamps.length - 1] >= USER_WINDOW_MS
      )
        requestsByUser.delete(id);
    }
  }
  const previous = requestsByUser.get(userId) ?? [];
  const recent = previous.filter(
    (timestamp) => now - timestamp < USER_WINDOW_MS,
  );
  const last = recent[recent.length - 1];
  if (
    (last !== undefined && now - last < USER_COOLDOWN_MS) ||
    recent.length >= MAX_REQUESTS_PER_WINDOW
  ) {
    requestsByUser.set(userId, recent);
    return true;
  }
  recent.push(now);
  requestsByUser.set(userId, recent);
  return false;
}

function isRequestBody(
  value: unknown,
): value is { scope: IntelligenceInput["scope"]; forecast_id?: string } {
  if (!value || typeof value !== "object") return false;
  const body = value as { scope?: unknown; forecast_id?: unknown };
  if (
    Object.keys(value).some((key) => key !== "scope" && key !== "forecast_id")
  )
    return false;
  return (
    (body.scope === "donor_dashboard" ||
      body.scope === "donor_forecast" ||
      body.scope === "ngo_dashboard") &&
    (body.scope !== "donor_forecast" ||
      (typeof body.forecast_id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          body.forecast_id,
        ))) &&
    (body.scope === "donor_forecast" || body.forecast_id === undefined)
  );
}

function donationFacts(
  rows: Array<Record<string, unknown>>,
): IntelligenceDonation[] {
  return rows.flatMap((row) => {
    if (
      typeof row.id !== "string" ||
      typeof row.food_name !== "string" ||
      typeof row.cuisine_type !== "string" ||
      typeof row.quantity !== "number" ||
         !Number.isFinite(row.quantity) ||
         row.quantity <= 0 ||
      typeof row.unit !== "string" ||
      typeof row.expires_at !== "string" ||
      typeof row.status !== "string"
    )
      return [];
    return [
      {
        id: row.id,
        food_name: row.food_name.slice(0, 120),
        cuisine_type: row.cuisine_type.slice(0, 80),
        quantity: row.quantity,
        unit: row.unit.slice(0, 30),
        expires_at: row.expires_at,
        status: row.status,
      },
    ];
  });
}

function isForecastFacts(
  row: Record<string, unknown>,
): row is Record<string, unknown> & ForecastFacts {
  return (
    typeof row.food_category === "string" &&
    typeof row.restaurant_type === "string" &&
    typeof row.meal_period === "string" &&
    typeof row.planned_quantity === "number" &&
    Number.isFinite(row.planned_quantity) &&
    row.planned_quantity > 0 &&
    typeof row.expected_customers === "number" &&
    Number.isFinite(row.expected_customers) &&
    row.expected_customers >= 0 &&
    typeof row.ready_at === "string" &&
    typeof row.predicted_quantity === "number" &&
    Number.isFinite(row.predicted_quantity) &&
    row.predicted_quantity >= 0 &&
    typeof row.uncertainty_lower === "number" &&
    Number.isFinite(row.uncertainty_lower) &&
    row.uncertainty_lower >= 0 &&
    typeof row.uncertainty_upper === "number" &&
    Number.isFinite(row.uncertainty_upper) &&
    row.uncertainty_upper >= row.uncertainty_lower &&
    typeof row.unit === "string" &&
    typeof row.model_version === "string"
  );
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (
    origin &&
    !new Set([
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      ...allowedOrigins(),
    ]).has(origin)
  ) {
    return response({ error: "This origin is not allowed." }, 403, origin);
  }
  if (request.method !== "POST")
    return response({ error: "Only POST is supported." }, 405, origin);
  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization)
    return response({ error: "Authentication is required." }, 401, origin);
  if (!supabaseUrl || !anonKey)
    return response(
      { error: "AI intelligence service is not configured on the server." },
      503,
      origin,
    );

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 4_096)
      return response({ error: "Request body is too large." }, 413, origin);
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return response({ error: "Request body must be valid JSON." }, 400, origin);
  }
  if (!isRequestBody(body))
    return response({ error: "Invalid AI intelligence request." }, 422, origin);

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user)
    return response(
      { error: "Authentication could not be verified." },
      401,
      origin,
    );
  const { data: profile, error: profileError } = await client
    .from("user_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError)
    return response(
      { error: "Account role could not be verified." },
      500,
      origin,
    );
  if (!intelligenceRoleAllowed(profile?.role, body.scope))
    return response(
      { error: "This account is not authorized for the requested insights." },
      403,
      origin,
    );

  const nowMs = Date.now();
  const rateLimited = tooManyRequests(userData.user.id, nowMs);
  const intelligence: IntelligenceInput = {
    scope: body.scope,
    now: new Date(nowMs).toISOString(),
    donations: [],
    demands: [],
    forecast: null,
  };

  if (body.scope === "donor_forecast") {
    const { data: forecast, error } = await client
      .from("surplus_forecasts")
      .select(
        "food_category, restaurant_type, meal_period, planned_quantity, expected_customers, ready_at, predicted_quantity, uncertainty_lower, uncertainty_upper, unit, model_version",
      )
      .eq("id", body.forecast_id!)
      .eq("donor_id", userData.user.id)
      .maybeSingle();
    if (error)
      return response(
        { error: "Forecast insights could not be loaded." },
        500,
        origin,
      );
    if (!forecast)
      return response(
        { error: "This forecast is unavailable to this donor account." },
        404,
        origin,
      );
    if (!isForecastFacts(forecast as Record<string, unknown>))
      return response(
        { error: "Saved forecast fields are incomplete." },
        422,
        origin,
      );
    intelligence.forecast = forecast as ForecastFacts;
  } else if (body.scope === "donor_dashboard") {
    const { data, error } = await client
      .from("donations")
      .select("id, food_name, cuisine_type, quantity, unit, expires_at, status")
      .eq("donor_id", userData.user.id)
      .order("expires_at", { ascending: true })
      .limit(50);
    if (error)
      return response(
        { error: "Donor donation insights could not be loaded." },
        500,
        origin,
      );
    intelligence.donations = donationFacts(
      (data ?? []) as Array<Record<string, unknown>>,
    );
  } else {
    const { data: donations, error: donationError } = await client.rpc(
      "list_available_donations",
      { p_donation_id: null },
    );
    if (donationError)
      return response(
        { error: "Available donation insights could not be loaded." },
        500,
        origin,
      );
    const { data: demands, error: demandError } = await client
      .from("ngo_demand_requirements")
      .select("food_category, required_quantity, unit, required_by, status")
      .eq("ngo_id", userData.user.id)
      .eq("status", "active")
      .order("required_by", { ascending: true })
      .limit(50);
    if (demandError)
      return response(
        { error: "Organization requirements could not be loaded." },
        500,
        origin,
      );
    const { data: ownRequests, error: requestError } = await client
      .from("pickup_requests")
      .select("donation_id, status")
      .eq("ngo_id", userData.user.id)
      .in("status", ["pending", "confirmed", "picked_up"]);
    if (requestError)
      return response(
        { error: "Existing pickup requests could not be loaded." },
        500,
        origin,
      );
    const existingDonationIds = new Set(
      (ownRequests ?? []).map((row) => row.donation_id),
    );
    intelligence.donations = donationFacts(
      (donations ?? []) as unknown as Array<Record<string, unknown>>,
    ).filter((donation) => !existingDonationIds.has(donation.id));
    intelligence.demands = (demands ?? []).flatMap((demand) =>
      typeof demand.food_category === "string" &&
      typeof demand.required_quantity === "number" &&
      typeof demand.unit === "string" &&
      typeof demand.required_by === "string" &&
      typeof demand.status === "string"
        ? [{ ...demand }]
        : [],
    );
  }

  const token = Deno.env.get("HF_TOKEN")?.trim();
  const model = Deno.env.get("HF_MODEL")?.trim() || DEFAULT_MODEL;
  if (rateLimited) {
    const fallback = buildFallbackIntelligence(
      intelligence,
      token ? "configured" : "missing_token",
    );
    return response(
      {
        ...fallback,
        fallback_reason: "rate_limited",
        provider: "fallback",
      },
      200,
      origin,
    );
  }
  const generated = await generateIntelligence(intelligence, token, model);
  if (
    generated.fallbackReason &&
    generated.fallbackReason !== "missing_token"
  ) {
    console.error(
      "AI intelligence provider request failed",
      generated.fallbackReason,
    );
  }
  return response(
    { ...generated.result, fallback_reason: generated.fallbackReason },
    200,
    origin,
  );
});
