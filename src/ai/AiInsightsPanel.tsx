import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, RefreshCw } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, InlineAlert, LoadingState, SectionHeading, StatusBadge } from "../components/ui";
import { supabase } from "../lib/supabase";
import {
    buildFallbackIntelligence,
    type IntelligenceInput,
    type IntelligenceResult,
} from "../../supabase/functions/_shared/intelligence";
import { getAiIntelligence, type IntelligenceScope } from "./api";
import "./intelligence.css";

const REFRESH_COOLDOWN_MS = 15_000;

function dateLabel(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function riskTone(risk: IntelligenceResult["risk_level"]) {
    if (risk === "high") return "danger" as const;
    if (risk === "medium") return "warning" as const;
    if (risk === "low") return "success" as const;
    return "info" as const;
}

function fallbackMessage(reason: string | null, configuration: IntelligenceResult["configuration_status"]) {
    if (configuration === "missing_token" || reason === "missing_token") return "HF_TOKEN is not configured. Deterministic recommendations are active.";
    if (configuration === "unavailable" || reason === "provider_unavailable" || reason === "provider_timeout") return "Hugging Face or the Edge Function is unavailable. Deterministic recommendations are active.";
    if (reason === "invalid_output") return "The model response did not pass validation. Deterministic recommendations are active.";
    if (reason === "rate_limited") return "Refresh is temporarily rate-limited. Deterministic recommendations are shown.";
    return null;
}

export function AiInsightsPanel({
    scope,
    fallbackInput,
    forecastId,
}: {
    scope: IntelligenceScope;
    fallbackInput: IntelligenceInput;
    forecastId?: string;
}) {
    const { session } = useAuth();
    const [result, setResult] = useState<IntelligenceResult | null>(null);
    const [fallbackReason, setFallbackReason] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [clock, setClock] = useState(Date.now());

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (!supabase || !session) throw new Error("Sign in to load role-specific AI insights.");
            const response = await getAiIntelligence(supabase, scope, forecastId);
            setResult(response);
            setFallbackReason(response.fallback_reason);
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : "AI insights could not be loaded.";
            if (fallbackInput) {
                setResult(buildFallbackIntelligence({ ...fallbackInput, now: new Date().toISOString() }, "unavailable"));
                setFallbackReason("edge_function_unavailable");
            } else {
                setError(message);
                setResult(null);
            }
        } finally {
            setLoading(false);
            setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
        }
    }, [fallbackInput, forecastId, scope, session]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        if (cooldownUntil <= Date.now()) return;
        const timer = window.setInterval(() => {
            const current = Date.now();
            setClock(current);
            if (current >= cooldownUntil) window.clearInterval(timer);
        }, 1_000);
        return () => window.clearInterval(timer);
    }, [cooldownUntil]);

    const waitSeconds = Math.max(0, Math.ceil((cooldownUntil - clock) / 1_000));
    const configurationStatus = result?.configuration_status ?? "unavailable";
    const notice = result ? fallbackMessage(fallbackReason, configurationStatus) : null;

    return (
        <Card className="ai-insights-card" padding="md">
            <div className="ai-insights-heading">
                <SectionHeading
                    description="Verified application data and model output are kept distinct from advisory text."
                    title="AI Insights"
                />
                <Button
                    disabled={loading || waitSeconds > 0}
                    icon={<RefreshCw size={15} />}
                    loading={loading}
                    onClick={() => void load()}
                    variant="outline"
                >
                    {waitSeconds > 0 ? `Insights in ${waitSeconds}s` : "Refresh insights"}
                </Button>
            </div>
            {loading && !result ? <LoadingState label="Preparing role-specific insights" /> : null}
            {error && <InlineAlert tone="warning">{error}</InlineAlert>}
            {notice && <InlineAlert tone="info">{notice}</InlineAlert>}
            {result && (
                <div aria-live="polite" className="ai-insights-content">
                    <div className="ai-insights-summary">
                        <span className="ai-insights-mark"><BrainCircuit aria-hidden="true" size={18} /></span>
                        <p>{result.summary}</p>
                        <StatusBadge tone={riskTone(result.risk_level)}>{result.risk_level} risk</StatusBadge>
                    </div>
                    {result.predicted_surplus && (
                        <div className="ai-insights-fact">
                            <span>Random Forest estimate</span>
                            <strong>{result.predicted_surplus.quantity.toLocaleString()} {result.predicted_surplus.unit}</strong>
                            <small>
                                Model range {result.predicted_surplus.lower.toLocaleString()}–{result.predicted_surplus.upper.toLocaleString()} {result.predicted_surplus.unit}; forecast {dateLabel(result.predicted_surplus.forecasted_at)}. This range is not a calibrated confidence interval.
                            </small>
                        </div>
                    )}
                    <div className="ai-insights-action">
                        <strong>Recommended next step</strong>
                        <p>{result.recommended_action}</p>
                        {result.recommended_donation_time && <small>Timing: {result.recommended_donation_time}</small>}
                    </div>
                    {result.urgent_donations.length > 0 && (
                        <div className="ai-insights-matches">
                            <strong>Expiring within 24 hours</strong>
                            <ul>
                                {result.urgent_donations.map((donation) => (
                                    <li key={donation.donation_id}>
                                        <span><b>{donation.food_name}</b> · {donation.quantity.toLocaleString()} {donation.unit}</span>
                                        <small>Expires {dateLabel(donation.expires_at)}. Confirm collection can happen before expiry.</small>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {result.matching_suggestions.length > 0 && (
                        <div className="ai-insights-matches">
                            <strong>Requirement matches</strong>
                            <ul>
                                {result.matching_suggestions.map((match) => (
                                    <li key={match.donation_id}>
                                        <span><b>{match.food_name}</b> · {match.quantity.toLocaleString()} {match.unit}</span>
                                        <small>Expires {dateLabel(match.expires_at)}. {match.reason}</small>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div className="ai-insights-detail-grid">
                        <div><strong>Food handling</strong><ul>{result.food_safety_notes.map((note) => <li key={note}>{note}</li>)}</ul></div>
                        <div><strong>Why this appeared</strong><p>{result.explanation}</p></div>
                    </div>
                    <div className="ai-insights-provenance">
                        <span>{result.provider === "huggingface" ? "Hugging Face explanation" : "Deterministic fallback"}</span>
                        <span>Based on: {result.data_sources.join("; ")}</span>
                    </div>
                    {result.limitations.map((limitation) => <small className="ai-insights-limitation" key={limitation}>{limitation}</small>)}
                </div>
            )}
        </Card>
    );
}