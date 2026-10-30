import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyEnhancement,
  buildEnhancementPrompt,
  buildFallbackIntelligence,
  generateIntelligence,
  intelligenceRoleAllowed,
  requestHuggingFaceEnhancement,
  type IntelligenceInput,
} from "../../supabase/functions/_shared/intelligence";

const now = "2030-01-01T12:00:00.000Z";

function input(overrides: Partial<IntelligenceInput> = {}): IntelligenceInput {
  return {
    scope: "ngo_dashboard",
    now,
    donations: [],
    demands: [],
    forecast: null,
    ...overrides,
  };
}

describe("AI intelligence fallback and provider boundary", () => {
  afterEach(() => vi.useRealTimers());

  it("excludes expired, claimed, and completed donations from availability and matching", () => {
    const result = buildFallbackIntelligence(
      input({
        donations: [
          {
            id: "expired-id",
            food_name: "Bread",
            cuisine_type: "bakery",
            quantity: 10,
            unit: "servings",
            expires_at: "2030-01-01T11:00:00.000Z",
            status: "available",
          },
          {
            id: "claimed-id",
            food_name: "Bread",
            cuisine_type: "bakery",
            quantity: 10,
            unit: "servings",
            expires_at: "2030-01-01T13:00:00.000Z",
            status: "claimed",
          },
          {
            id: "done-id",
            food_name: "Bread",
            cuisine_type: "bakery",
            quantity: 10,
            unit: "servings",
            expires_at: "2030-01-01T13:00:00.000Z",
            status: "completed",
          },
        ],
        demands: [
          {
            food_category: "bakery",
            required_quantity: 10,
            unit: "servings",
            required_by: "2030-01-01T12:30:00.000Z",
            status: "active",
          },
        ],
      }),
      "missing_token",
    );

    expect(result.summary).toContain("0 unexpired available donations");
    expect(result.matching_suggestions).toEqual([]);
  });

  it("matches only active demand with a compatible category, unit, quantity, and required-by time", () => {
    const result = buildFallbackIntelligence(
      input({
        donations: [
          {
            id: "safe-id",
            food_name: "Bread",
            cuisine_type: "bakery",
            quantity: 10,
            unit: "servings",
            expires_at: "2030-01-01T15:00:00.000Z",
            status: "available",
          },
        ],
        demands: [
          {
            food_category: "bakery",
            required_quantity: 10,
            unit: "servings",
            required_by: "2030-01-01T14:00:00.000Z",
            status: "active",
          },
          {
            food_category: "bakery",
            required_quantity: 100,
            unit: "kg",
            required_by: "2030-01-01T14:00:00.000Z",
            status: "active",
          },
          {
            food_category: "bakery",
            required_quantity: 100,
            unit: "servings",
            required_by: "2030-01-01T16:00:00.000Z",
            status: "active",
          },
        ],
      }),
      "missing_token",
    );

    expect(
      result.matching_suggestions.map((match) => match.donation_id),
    ).toEqual(["safe-id"]);
    expect(
      result.urgent_donations.map((donation) => donation.donation_id),
    ).toEqual(["safe-id"]);
  });

  it("keeps prediction fields sourced from saved Random Forest facts", () => {
    const result = buildFallbackIntelligence(
      input({
        scope: "donor_forecast",
        forecast: {
          food_category: "prepared_meal",
          restaurant_type: "restaurant",
          meal_period: "dinner",
          planned_quantity: 100,
          expected_customers: 80,
          ready_at: "2030-01-01T18:00:00.000Z",
          predicted_quantity: 12.5,
          uncertainty_lower: 4,
          uncertainty_upper: 25,
          unit: "servings",
          model_version: "rf-demo-hotel-v2",
        },
      }),
      "missing_token",
    );

    expect(result.predicted_surplus).toMatchObject({
      quantity: 12.5,
      lower: 4,
      upper: 25,
      source: "random_forest",
    });
    expect(result.explanation).toContain("not calibrated confidence");
    expect(result.provider).toBe("fallback");
  });

  it("allows donor and NGO scopes only for their matching authenticated role", () => {
    expect(intelligenceRoleAllowed("donor", "donor_dashboard")).toBe(true);
    expect(intelligenceRoleAllowed("donor", "ngo_dashboard")).toBe(false);
    expect(intelligenceRoleAllowed("ngo", "ngo_dashboard")).toBe(true);
    expect(intelligenceRoleAllowed("ngo", "donor_forecast")).toBe(false);
    expect(intelligenceRoleAllowed(null, "donor_dashboard")).toBe(false);
  });

  it("uses deterministic fallback without an HF token", async () => {
    const generated = await generateIntelligence(
      input(),
      undefined,
      "test/model",
    );
    expect(generated.fallbackReason).toBe("missing_token");
    expect(generated.result.provider).toBe("fallback");
    expect(generated.result.configuration_status).toBe("missing_token");
  });

  it("accepts a supported structured Hugging Face enhancement", async () => {
    const facts = input();
    const fallback = buildFallbackIntelligence(facts, "configured");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  explanation: fallback.explanation,
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const generated = await generateIntelligence(
      facts,
      "hf-test",
      "test/model",
      fetcher,
    );
    expect(generated.fallbackReason).toBeNull();
    expect(generated.result.provider).toBe("huggingface");
  });

  it("falls back for malformed JSON and unsupported model claims", async () => {
    const facts = input();
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "not-json" } }],
        }),
        { status: 200 },
      ),
    );
    await expect(
      generateIntelligence(facts, "hf-test", "test/model", malformed),
    ).resolves.toMatchObject({
      fallbackReason: "provider_unavailable",
      result: { provider: "fallback" },
    });

    const unsupported = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  explanation: "Food is safe for 10 hours. Pickup confirmed.",
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(
      generateIntelligence(facts, "hf-test", "test/model", unsupported),
    ).resolves.toMatchObject({
      fallbackReason: "invalid_output",
      result: { provider: "fallback" },
    });
  });

  it("rejects malformed, unsupported, or numerically unsupported explanations", () => {
    const fallback = buildFallbackIntelligence(input(), "configured");
    expect(applyEnhancement(fallback, { explanation: "" })).toBeNull();
    expect(
      applyEnhancement(fallback, { explanation: "There are 450 donations" }),
    ).toBeNull();
    expect(
      applyEnhancement(fallback, {
        explanation: "Food is safe for 10 hours. Pickup confirmed.",
      }),
    ).toBeNull();
    expect(
      applyEnhancement(fallback, {
        explanation: fallback.explanation,
      })?.provider,
    ).toBe("huggingface");
  });

  it("does not put donation IDs or user-entered names in the provider prompt", () => {
    const data = input({
      donations: [
        {
          id: "private-row-id",
          food_name: "Contact person@example.com 555-123-4567",
          cuisine_type: "bakery",
          quantity: 4,
          unit: "servings",
          expires_at: "2030-01-01T15:00:00.000Z",
          status: "available",
        },
      ],
    });
    const prompt = buildEnhancementPrompt(
      buildFallbackIntelligence(data, "configured"),
    );

    expect(prompt).not.toContain("private-row-id");
    expect(prompt).not.toContain("person@example.com");
    expect(prompt).not.toContain("555-123-4567");
    expect(prompt).not.toContain("Contact person");
    expect(prompt).not.toContain("active_donations");
    expect(prompt).toContain('"matching_count":0');
  });

  it("parses a successful Hugging Face structured response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "A concise summary",
                  explanation: "A grounded explanation.",
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      requestHuggingFaceEnhancement("hf-test", "test/model", "{}", fetcher),
    ).resolves.toEqual({
      summary: "A concise summary",
      explanation: "A grounded explanation.",
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://router.huggingface.co/v1/chat/completions",
    );
  });

  it("handles provider API failures and timeout errors without hiding them from fallback callers", async () => {
    const failedFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(
      requestHuggingFaceEnhancement(
        "hf-test",
        "test/model",
        "{}",
        failedFetcher,
      ),
    ).rejects.toThrow("response 429");
    await expect(
      generateIntelligence(input(), "hf-test", "test/model", failedFetcher),
    ).resolves.toMatchObject({
      fallbackReason: "provider_unavailable",
      result: { provider: "fallback" },
    });

    vi.useFakeTimers();
    const timeoutFetcher = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const timedOut = requestHuggingFaceEnhancement(
      "hf-test",
      "test/model",
      "{}",
      timeoutFetcher,
    );
    const fallbackAfterTimeout = generateIntelligence(
      input(),
      "hf-test",
      "test/model",
      timeoutFetcher,
    );
    const timeoutAssertion = expect(timedOut).rejects.toMatchObject({
      name: "AbortError",
    });
    const fallbackAssertion = expect(fallbackAfterTimeout).resolves.toMatchObject({
      fallbackReason: "provider_timeout",
      result: { provider: "fallback" },
    });
    await vi.advanceTimersByTimeAsync(8_000);
    await timeoutAssertion;
    await fallbackAssertion;
  });
});
