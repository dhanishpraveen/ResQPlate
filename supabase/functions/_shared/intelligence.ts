export type IntelligenceDonation = {
  id: string;
  food_name: string;
  cuisine_type: string;
  quantity: number;
  unit: string;
  expires_at: string;
  status: string;
};

export type IntelligenceDemand = {
  food_category: string;
  required_quantity: number;
  unit: string;
  required_by: string;
  status: string;
};

export type ForecastFacts = {
  food_category: string;
  restaurant_type: string;
  meal_period: string;
  planned_quantity: number;
  expected_customers: number;
  ready_at: string;
  predicted_quantity: number;
  uncertainty_lower: number;
  uncertainty_upper: number;
  unit: string;
  model_version: string;
};

export type IntelligenceInput = {
  scope: "donor_dashboard" | "donor_forecast" | "ngo_dashboard";
  now: string;
  donations: IntelligenceDonation[];
  demands: IntelligenceDemand[];
  forecast: ForecastFacts | null;
};

export type IntelligenceResult = {
  summary: string;
  risk_level: "low" | "medium" | "high" | "unknown";
  predicted_surplus: null | {
    quantity: number;
    unit: string;
    lower: number;
    upper: number;
    forecasted_at: string;
    model_version: string;
    source: "random_forest";
  };
  recommended_action: string;
  recommended_donation_time: string | null;
  food_safety_notes: string[];
  urgent_donations: Array<{
    donation_id: string;
    food_name: string;
    quantity: number;
    unit: string;
    expires_at: string;
    hours_to_expiry: number;
  }>;
  matching_suggestions: Array<{
    donation_id: string;
    food_name: string;
    quantity: number;
    unit: string;
    expires_at: string;
    reason: string;
  }>;
  explanation: string;
  data_sources: string[];
  limitations: string[];
  provider: "huggingface" | "fallback";
  configuration_status: "configured" | "missing_token" | "unavailable";
};

const MAX_DONATIONS = 50;
const MAX_DEMANDS = 50;
const ACTIVE_DONATION_STATUS = "available";

function validDate(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fallbackResult(
  input: IntelligenceInput,
  configurationStatus: IntelligenceResult["configuration_status"],
): IntelligenceResult {
  const now = validDate(input.now) ?? Date.now();
  const activeDonations = input.donations
    .filter((donation) => donation.status === ACTIVE_DONATION_STATUS)
    .filter((donation) => Number.isFinite(donation.quantity) && donation.quantity > 0)
    .filter(
      (donation) =>
        validDate(donation.expires_at) !== null &&
        Date.parse(donation.expires_at) > now,
    )
    .slice(0, MAX_DONATIONS);
  const nextExpiry =
    activeDonations
      .map((donation) => Date.parse(donation.expires_at))
      .sort((left, right) => left - right)[0] ?? null;
  const hoursToExpiry =
    nextExpiry === null ? null : (nextExpiry - now) / 3_600_000;
  const urgentDonations = input.scope === "ngo_dashboard"
    ? activeDonations
        .map((donation) => ({ donation, hours: (Date.parse(donation.expires_at) - now) / 3_600_000 }))
        .filter(({ hours }) => hours <= 24)
        .sort((left, right) => left.hours - right.hours)
        .slice(0, 5)
        .map(({ donation, hours }) => ({
          donation_id: donation.id,
          food_name: donation.food_name,
          quantity: donation.quantity,
          unit: donation.unit,
          expires_at: donation.expires_at,
          hours_to_expiry: Math.round(hours * 10) / 10,
        }))
    : [];
  const forecast = input.scope === "donor_forecast" ? input.forecast : null;
  const predicted = forecast
    ? {
        quantity: forecast.predicted_quantity,
        unit: forecast.unit,
        lower: forecast.uncertainty_lower,
        upper: forecast.uncertainty_upper,
        forecasted_at: forecast.ready_at,
        model_version: forecast.model_version,
        source: "random_forest" as const,
      }
    : null;
  const forecastShare =
    forecast && forecast.planned_quantity > 0
      ? forecast.predicted_quantity / forecast.planned_quantity
      : null;
  const risk: IntelligenceResult["risk_level"] =
    forecastShare !== null
      ? forecastShare >= 0.5
        ? "high"
        : forecastShare >= 0.2
          ? "medium"
          : "low"
      : hoursToExpiry === null
        ? "unknown"
        : hoursToExpiry <= 6
          ? "high"
          : hoursToExpiry <= 24
            ? "medium"
            : "low";
  const demands = input.demands
    .filter(
      (demand) =>
        demand.status === "active" &&
        Number.isFinite(demand.required_quantity) &&
        demand.required_quantity > 0 &&
        validDate(demand.required_by) !== null &&
        Date.parse(demand.required_by) > now,
    )
    .slice(0, MAX_DEMANDS);
  const matches =
    input.scope === "ngo_dashboard"
      ? activeDonations
          .filter((donation) =>
            demands.some(
              (demand) =>
                demand.unit === donation.unit &&
                demand.required_quantity >= donation.quantity &&
                demand.food_category.trim().length > 0 &&
                `${donation.food_name} ${donation.cuisine_type}`
                  .toLocaleLowerCase()
                  .includes(demand.food_category.toLocaleLowerCase()) &&
                Date.parse(demand.required_by) <=
                  Date.parse(donation.expires_at),
            ),
          )
          .slice(0, 5)
          .map((donation) => ({
            donation_id: donation.id,
            food_name: donation.food_name,
            quantity: donation.quantity,
            unit: donation.unit,
            expires_at: donation.expires_at,
            reason:
              "Matches an active category and quantity requirement and remains within its required-by time.",
          }))
      : [];

  const summary =
    input.scope === "ngo_dashboard"
      ? `${activeDonations.length} unexpired available donation${activeDonations.length === 1 ? "" : "s"} ${activeDonations.length === 1 ? "is" : "are"} visible; ${urgentDonations.length} expire within 24 hours; ${matches.length} match an active recorded requirement.`
      : forecast
        ? `The Random Forest estimates ${forecast.predicted_quantity} ${forecast.unit} for ${forecast.food_category.replaceAll("_", " ")} at ${new Date(forecast.ready_at).toLocaleString("en", { timeZone: "UTC" })} UTC.`
        : activeDonations.length
          ? `${activeDonations.length} current unexpired donation${activeDonations.length === 1 ? "" : "s"} found. The earliest expiry is ${new Date(nextExpiry!).toLocaleString("en", { timeZone: "UTC" })} UTC.`
          : "No current unexpired available donations need prioritization.";

  const action =
    input.scope === "ngo_dashboard"
      ? urgentDonations.length
        ? "Review the expiring listings first; request pickup only after confirming collection can happen before expiry."
        : matches.length
          ? "Review matched listings and confirm that pickup can occur before expiry."
          : "Review current listings and recorded requirements; confirm pickup feasibility before requesting."
      : forecast
        ? "Use the estimate for planning, then verify actual surplus before publishing a donation."
        : hoursToExpiry !== null && hoursToExpiry <= 24
          ? "Prioritize arranging a feasible pickup before the earliest expiry."
          : activeDonations.length
            ? "Review available listings and update them if food or timing has changed."
            : "Create a forecast with known planning inputs or publish a confirmed donation when food is ready.";

  const urgencyTime =
    nextExpiry === null
      ? null
      : `Before ${new Date(nextExpiry).toISOString()} (pickup time must be confirmed)`;
  const safetyNotes =
    input.scope === "donor_forecast"
      ? [
          "Follow applicable food-safety requirements and your established temperature controls.",
          "Do not publish an estimated forecast as confirmed food availability.",
        ]
      : [
          "Follow applicable food-safety requirements and maintain safe temperature controls.",
          "Confirm handling and allergen information from the verified listing before collection.",
        ];
  const sources =
    input.scope === "donor_forecast"
      ? [
          "Saved Random Forest forecast and its model-provided tree quantile range",
          "Forecast inputs entered by the donor",
        ]
      : input.scope === "ngo_dashboard"
        ? [
            "RLS-authorized available donation listings",
            "This NGO's active recorded requirements",
          ]
        : [
            "RLS-authorized donor donation listings",
            "Donation status and expiry timestamps",
          ];

  return {
    summary,
    risk_level: risk,
    predicted_surplus: predicted,
    recommended_action: action,
    recommended_donation_time:
      input.scope === "ngo_dashboard"
        ? null
        : forecast
          ? `After ${new Date(forecast.ready_at).toISOString()}, once actual surplus is verified`
          : urgencyTime,
    food_safety_notes: safetyNotes,
    urgent_donations: urgentDonations,
    matching_suggestions: matches,
    explanation: forecast
      ? "Risk is a planning heuristic based on predicted surplus as a share of planned quantity: high at 50% or above, medium at 20% or above, otherwise low. The quantity and range come from the saved model forecast; its training data is synthetic demo data, and its range is not calibrated confidence."
      : input.scope === "ngo_dashboard"
        ? "Matches use only exact recorded category text, compatible units, sufficient recorded requirement quantity, and required-by time no later than expiry. No distance, capacity, or volunteer availability is inferred."
        : "Urgency is based only on future expiry among records currently marked available: high within 6 hours, medium within 24 hours, low after 24 hours. Pickup schedules are not known here, so feasibility must be confirmed before action.",
    data_sources: sources,
    limitations: [
      "Suggestions are advisory and do not create or change donations, requests, or delivery records.",
      ...(forecast
        ? [
            "The Random Forest was trained on synthetic demo hotel records; real-world accuracy has not been established.",
            "No preparation or portion adjustment is suggested without genuine measured donor outcomes.",
          ]
        : []),
      ...(input.scope === "ngo_dashboard"
        ? [
            "No location, travel time, volunteer availability, or unrecorded NGO capacity is available to this analysis.",
          ]
        : []),
    ],
    provider: "fallback",
    configuration_status: configurationStatus,
  };
}

export function buildFallbackIntelligence(
  input: IntelligenceInput,
  configurationStatus: IntelligenceResult["configuration_status"],
): IntelligenceResult {
  return fallbackResult(input, configurationStatus);
}

export function intelligenceRoleAllowed(
  role: string | null | undefined,
  scope: IntelligenceInput["scope"],
) {
  return scope === "ngo_dashboard" ? role === "ngo" : role === "donor";
}

export function buildEnhancementPrompt(fallback: IntelligenceResult) {
  return JSON.stringify({
    task: "Rewrite only the explanation in concise plain language. Do not change the supplied summary or recommended action. Do not add facts, quantities, times, food-safety claims, or actions.",
    verified_facts: {
      summary: fallback.summary,
      recommended_action: fallback.recommended_action,
      predicted_surplus: fallback.predicted_surplus,
      food_safety_notes: fallback.food_safety_notes,
      urgent_donation_count: fallback.urgent_donations.length,
      matching_count: fallback.matching_suggestions.length,
      explanation: fallback.explanation,
    },
    output_schema: { explanation: "string" },
  });
}

export function applyEnhancement(
  fallback: IntelligenceResult,
  value: unknown,
): IntelligenceResult | null {
  if (!value || typeof value !== "object") return null;
  const enhancement = value as { explanation?: unknown };
  if (typeof enhancement.explanation !== "string") return null;
  const explanation = enhancement.explanation.trim();
  if (!explanation || explanation.length > 600) return null;
  const candidateText = [
    fallback.summary,
    fallback.recommended_action,
    fallback.explanation,
    ...fallback.food_safety_notes,
    ...fallback.data_sources,
    ...fallback.limitations,
    ...fallback.matching_suggestions.map((match) => match.reason),
  ]
    .join(" ")
    .toLocaleLowerCase();
  const supportedWords = new Set(candidateText.match(/[a-z]+/g) ?? []);
  const connectiveWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "before",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
    "within",
  ]);
  const newWords = explanation.toLocaleLowerCase().match(/[a-z]+/g) ?? [];
  const supportedNumbers = new Set(candidateText.match(/\b\d+(?:\.\d+)?\b/g) ?? []);
  if (
    newWords.some(
      (word) => !supportedWords.has(word) && !connectiveWords.has(word),
    )
  )
    return null;
  const numericTokens = explanation.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  if (numericTokens.some((token) => !supportedNumbers.has(token)))
    return null;
  return {
    ...fallback,
    explanation,
    provider: "huggingface",
    configuration_status: "configured",
  };
}

export async function requestHuggingFaceEnhancement(
  token: string,
  model: string,
  prompt: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetcher(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "Return only a JSON object with one explanation string field. Do not change the summary or recommended action; do not make operational decisions.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 300,
          stream: false,
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok)
      throw new Error(`Hugging Face response ${response.status}`);
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("choices" in body) ||
      !Array.isArray(body.choices)
    ) {
      throw new Error("Hugging Face response was malformed");
    }
    const content = body.choices[0]?.message?.content;
    if (typeof content !== "string")
      throw new Error("Hugging Face response content was malformed");
    return JSON.parse(content) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateIntelligence(
  input: IntelligenceInput,
  token: string | undefined,
  model: string,
  fetcher: typeof fetch = fetch,
): Promise<{ result: IntelligenceResult; fallbackReason: string | null }> {
  const fallback = buildFallbackIntelligence(
    input,
    token ? "configured" : "missing_token",
  );
  if (!token?.trim())
    return { result: fallback, fallbackReason: "missing_token" };
  try {
    const raw = await requestHuggingFaceEnhancement(
      token,
      model,
      buildEnhancementPrompt(fallback),
      fetcher,
    );
    const result = applyEnhancement(fallback, raw);
    return result
      ? { result, fallbackReason: null }
      : { result: fallback, fallbackReason: "invalid_output" };
  } catch (error) {
    return {
      result: fallback,
      fallbackReason:
        error instanceof DOMException && error.name === "AbortError"
          ? "provider_timeout"
          : "provider_unavailable",
    };
  }
}
