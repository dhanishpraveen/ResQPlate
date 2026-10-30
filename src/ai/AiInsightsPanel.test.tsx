import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiInsightsPanel } from "./AiInsightsPanel";
import type { IntelligenceInput } from "../../supabase/functions/_shared/intelligence";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../auth/AuthContext", () => ({
    useAuth: () => ({ session: { user: { id: "user-1" } } }),
}));

vi.mock("../lib/supabase", () => ({
    supabase: { functions: { invoke: mocks.invoke } },
}));

afterEach(() => {
    cleanup();
    mocks.invoke.mockReset();
});

const fallbackInput: IntelligenceInput = {
    scope: "donor_dashboard",
    now: "2030-01-01T12:00:00.000Z",
    donations: [],
    demands: [],
    forecast: null,
};

const response = {
    summary: "No current unexpired available donations need prioritization.",
    risk_level: "unknown",
    predicted_surplus: null,
    recommended_action: "Create a forecast with known planning inputs.",
    recommended_donation_time: null,
    food_safety_notes: ["Maintain safe temperature controls."],
    urgent_donations: [{
        donation_id: "donation-urgent",
        food_name: "Bread loaves",
        quantity: 8,
        unit: "servings",
        expires_at: "2030-01-01T18:00:00.000Z",
        hours_to_expiry: 6,
    }],
    matching_suggestions: [],
    explanation: "Urgency is based on current expiry timestamps.",
    data_sources: ["RLS-authorized donor donation listings"],
    limitations: ["Suggestions do not change donation records."],
    provider: "fallback",
    configuration_status: "missing_token",
    fallback_reason: "missing_token",
};

describe("AiInsightsPanel", () => {
    it("shows deterministic insights and clear missing-token configuration status", async () => {
        mocks.invoke.mockResolvedValue({ data: response, error: null });
        render(<AiInsightsPanel fallbackInput={fallbackInput} scope="donor_dashboard" />);

        expect(await screen.findByText(/HF_TOKEN is not configured/i)).toBeInTheDocument();
        expect(screen.getByText(response.recommended_action)).toBeInTheDocument();
        expect(screen.getByText("Expiring within 24 hours")).toBeInTheDocument();
        expect(screen.getByText(/Bread loaves/)).toBeInTheDocument();
        expect(screen.getByText(/Deterministic fallback/)).toBeInTheDocument();
        expect(mocks.invoke).toHaveBeenCalledWith("ai-intelligence", { body: { scope: "donor_dashboard" } });
    });

    it("keeps the insights panel useful when the Edge Function is unavailable", async () => {
        mocks.invoke.mockRejectedValue(new Error("function unavailable"));
        render(<AiInsightsPanel fallbackInput={fallbackInput} scope="donor_dashboard" />);

        expect(await screen.findByText(/Hugging Face or the Edge Function is unavailable/i)).toBeInTheDocument();
        expect(screen.getByText("Create a forecast with known planning inputs or publish a confirmed donation when food is ready.")).toBeInTheDocument();
    });
});