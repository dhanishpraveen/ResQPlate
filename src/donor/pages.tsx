import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CircleAlert,
  Clock3,
  Leaf,
  MapPin,
  PackageCheck,
  Plus,
  Salad,
  Utensils,
  UsersRound,
  BrainCircuit,
} from "lucide-react";
import { AppShell, PageHeader } from "../components/layout";
import { LocationInput } from "../components/location-input";
import {
  Button,
  Card,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  ProgressTimeline,
  SectionHeading,
  StatCard,
  StatusBadge,
  TextField,
  TextareaField,
  SelectField,
} from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import {
  fetchCompletedImpact,
  createDonation,
  fetchDonations,
  fetchPickupRequests,
  fetchPickupRequestVolunteerAssignment,
  reviewPickupRequest,
  fetchSignedImages,
  buildDonationWriteValues,
  formatDonationSaveError,
  formatSupabaseError,
  canConfirmDonorHandover,
  uploadPrivateImage,
  type CompletedImpactRow,
  type DonationRow,
  type PickupRequestRow,
} from "./data";
import { calculateDonorImpact, displayedDonationStatus, formatQuantity, monthlyCompletedSummary } from "./metrics";
import { validateDonation, validateFoodImage, type DonationDraft } from "./validation";
import {
  createForecastOutcome,
  listDonorForecastOutcomes,
  listDonorForecasts,
  type ForecastOutcome,
  type ForecastOutcomeInsert,
  type ForecastPrediction,
} from "../ai/data";
import { predictSurplus } from "../ai/api";
import { ForecastOutcomeForm } from "../ai/ForecastOutcomeForm";

type LoadState<T> = { data: T; error: null; loading: false } | { data: null; error: string; loading: false } | { data: null; error: null; loading: true };

function messageOf(error: unknown) {
  return formatSupabaseError(error);
}

function dateLabel(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Invalid date" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function localDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function statusTone(status: string) {
  if (status === "completed" || status === "picked_up") return "success" as const;
  if (status === "claimed" || status === "confirmed" || status === "pending") return "warning" as const;
  if (status === "cancelled" || status === "declined" || status === "expired") return "danger" as const;
  return "info" as const;
}

function Status({ status }: { status: string }) {
  return <StatusBadge tone={statusTone(status)}>{status.replaceAll("_", " ")}</StatusBadge>;
}

function DonorShell({ activeLabel, children, title, description, action }: {
  activeLabel: string;
  children: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const { profile, session } = useAuth();
  return (
    <AppShell activeLabel={activeLabel} role="donor" userName={profile?.full_name ?? session?.user.email ?? "Donor"}>
      <PageHeader action={action} description={description} title={title} />
      {children}
    </AppShell>
  );
}

function useDonorData() {
  const { session } = useAuth();
  const [state, setState] = useState<LoadState<{ donations: DonationRow[]; requests: PickupRequestRow[]; imageUrls: Map<string, string> }>>({
    data: null,
    error: null,
    loading: true,
  });
  const reload = useCallback(async () => {
    if (!supabase || !session) {
      setState({ data: null, error: supabaseConfigurationError ?? "Sign in to load donor data.", loading: false });
      return;
    }
    setState({ data: null, error: null, loading: true });
    try {
      const [donations, requests] = await Promise.all([
        fetchDonations(supabase, session.user.id),
        fetchPickupRequests(supabase),
      ]);
      const imageUrls = await fetchSignedImages(supabase, "donation-images", donations.map((donation) => donation.photo_path));
      setState({ data: { donations, requests, imageUrls }, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error: messageOf(error), loading: false });
    }
  }, [session]);

  useEffect(() => { void reload(); }, [reload]);
  return { ...state, reload };
}

function FoodImage({ src, name, className = "" }: { src?: string; name: string; className?: string }) {
  return src
    ? <img alt={`${name} donation`} className={`donor-food-image ${className}`.trim()} src={src} />
    : <div aria-label={`${name}: food photo unavailable`} className={`donor-food-image donor-food-placeholder ${className}`.trim()} role="img"><Salad aria-hidden="true" size={24} /><span>Food photo unavailable</span></div>;
}

function DonationRowCard({
  donation,
  imageUrl,
  actions,
}: {
  donation: DonationRow;
  imageUrl?: string;
  actions?: ReactNode;
}) {
  const status = displayedDonationStatus(donation.status, donation.expires_at);
  return (
    <article className="donor-listing-card">
      <FoodImage className="donor-listing-photo" name={donation.food_name} src={imageUrl} />
      <div className="donor-listing-main">
        <div className="donor-listing-heading">
          <h3>{donation.food_name}</h3>
          <Status status={status} />
        </div>
        <p>{donation.cuisine_type} · {formatQuantity(donation.quantity, donation.unit)}</p>
        <div className="donor-listing-meta">
          <span><Clock3 aria-hidden="true" size={14} /> Expires {dateLabel(donation.expires_at)}</span>
          <span><CalendarClock aria-hidden="true" size={14} /> Created {dateLabel(donation.created_at)}</span>
        </div>
      </div>
      <div className="donor-listing-actions">{actions}</div>
    </article>
  );
}

export function DonorDashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useDonorData();
  const [impact, setImpact] = useState<LoadState<CompletedImpactRow[]>>({ data: null, error: null, loading: true });

  const loadImpact = useCallback(async () => {
    if (!supabase) {
      setImpact({ data: null, error: supabaseConfigurationError ?? "Supabase is not configured.", loading: false });
      return;
    }
    setImpact({ data: null, error: null, loading: true });
    try {
      setImpact({ data: await fetchCompletedImpact(supabase), error: null, loading: false });
    } catch (cause) {
      setImpact({ data: null, error: messageOf(cause), loading: false });
    }
  }, []);

  useEffect(() => { void loadImpact(); }, [loadImpact]);
  const metrics = useMemo(() => impact.data ? calculateDonorImpact(impact.data) : null, [impact.data]);
  const monthly = useMemo(() => impact.data ? monthlyCompletedSummary(impact.data) : [], [impact.data]);
  const recent = data?.donations.slice(0, 4) ?? [];
  const displayName = profile?.full_name?.split(/\s+/)[0] ?? "there";

  return (
    <DonorShell activeLabel="Dashboard" title={`Welcome, ${displayName}!`} description="Help good food find its next stop.">
      <div className="donor-dashboard-stack">
        {(error || impact.error) && <ErrorState description={error ?? impact.error ?? "Could not load donor data."} onRetry={() => { void reload(); void loadImpact(); }} />}
        <section aria-label="Verified donor impact" className="donor-stat-grid">
          <StatCard detail="Completed, verified servings" icon={<Utensils size={19} />} label="Meals donated" value={metrics ? metrics.mealsDonated.toLocaleString() : loading || impact.loading ? "…" : "0"} />
          <StatCard detail="Completed donations measured in kg" icon={<Leaf size={19} />} label="Food saved" tone="mint" value={metrics ? `${metrics.foodSavedKg.toLocaleString()} kg` : loading || impact.loading ? "…" : "0 kg"} />
          <StatCard detail="Requires recipient receipt data" icon={<UsersRound size={19} />} label="People fed" tone="amber" value={metrics ? "—" : loading || impact.loading ? "…" : "—"} />
          <StatCard detail="No approved emissions factor configured" icon={<ArrowDownRight size={19} />} label="CO₂ reduced" tone="blue" value={metrics ? "—" : loading || impact.loading ? "…" : "—"} />
        </section>

        <section className="donor-promo-banner">
          <div className="donor-promo-copy">
            <span className="donor-promo-eyebrow">Good food, shared impact</span>
            <h2>Have Surplus Food?</h2>
            <p>List what you have available so nearby community organizations can request a pickup.</p>
            <Button icon={<Plus size={16} />} onClick={() => navigate("/donor/donations/new")}>Create Donation</Button>
          </div>
          <div aria-hidden="true" className="donor-promo-art"><Salad size={84} strokeWidth={1.2} /><Leaf className="donor-promo-leaf" size={54} strokeWidth={1.4} /></div>
        </section>

        <Card className="donor-ai-card" padding="lg">
          <div className="donor-ai-card-copy">
            <span className="donor-ai-icon"><BrainCircuit aria-hidden="true" size={22} /></span>
            <div>
              <h2>AI Food Surplus Prediction</h2>
              <p>Estimate potential surplus before publishing a confirmed donation. Predictions never create or publish food automatically.</p>
            </div>
          </div>
          <Link className="donor-primary-link" to="/donor/forecast">Predict food surplus <ArrowRight aria-hidden="true" size={15} /></Link>
        </Card>

        <div className="donor-dashboard-lower">
          <Card className="donor-dashboard-card" padding="md">
            <SectionHeading
              action={<Link className="donor-text-link" to="/donor/donations">View All <ArrowRight aria-hidden="true" size={15} /></Link>}
              description="Your latest food listings and their current status."
              title="Recent Donations"
            />
            {loading ? <LoadingState label="Loading your donations" /> : error ? null : recent.length === 0
              ? <EmptyState action={<Link className="donor-button-link" to="/donor/donations/new">Create your first donation</Link>} description="Your active and past donations will appear here." title="No donations yet" />
              : <div className="donor-recent-list">{recent.map((donation) => (
                <Link className="donor-recent-row" key={donation.id} to={`/donor/donations/${donation.id}`}>
                  <FoodImage className="donor-recent-photo" name={donation.food_name} src={data?.imageUrls.get(donation.photo_path ?? "")} />
                  <span className="donor-recent-copy"><strong>{donation.food_name}</strong><small>{formatQuantity(donation.quantity, donation.unit)} · expires {dateLabel(donation.expires_at)}</small></span>
                  <Status status={displayedDonationStatus(donation.status, donation.expires_at)} />
                </Link>
              ))}</div>}
          </Card>
          <Card className="donor-dashboard-card" padding="md">
            <SectionHeading description="Completed donation records measured in kilograms." title="Monthly Impact" />
            {impact.loading ? <LoadingState label="Calculating completed impact" /> : impact.error ? <p className="donor-chart-note">Impact data could not be loaded.</p> : impact.data?.length
              ? <MonthlyImpactChart months={monthly} />
              : <EmptyState description="This chart will show completed donation impact after an authorized recipient confirms receipt." title="No completed impact yet" />}
          </Card>
        </div>
        {!impact.loading && !impact.error && <InlineAlert tone="info" title="Impact measurement">
          People fed and CO₂ reduction remain unavailable until verified recipient counts and an approved emissions factor are defined. No estimates are shown.
        </InlineAlert>}
      </div>
    </DonorShell>
  );
}

type ForecastForm = {
  food_category: string;
  restaurant_type: string;
  meal_period: "breakfast" | "lunch" | "dinner" | "banquet";
  planned_quantity: string;
  expected_customers: string;
  ready_at: string;
};

const forecastCategories = [
  { value: "prepared_meal", label: "Prepared meal" },
  { value: "bakery", label: "Bakery" },
  { value: "produce", label: "Produce" },
  { value: "salad", label: "Salad" },
  { value: "sandwich", label: "Sandwich" },
];

const restaurantTypes = [
  { value: "restaurant", label: "Restaurant" },
  { value: "cafe", label: "Cafe" },
  { value: "caterer", label: "Caterer" },
];

const mealPeriods = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "banquet", label: "Banquet / event" },
];

function forecastDateLabel(value: string) {
  return dateLabel(value ? new Date(value).toISOString() : null);
}

export function DonorForecastPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<ForecastForm>({
    food_category: "prepared_meal",
    restaurant_type: "restaurant",
    meal_period: "dinner",
    planned_quantity: "",
    expected_customers: "",
    ready_at: "",
  });
  const [prediction, setPrediction] = useState<ForecastPrediction | null>(null);
  const [forecasts, setForecasts] = useState<Awaited<ReturnType<typeof listDonorForecasts>>>([]);
  const [outcomes, setOutcomes] = useState<ForecastOutcome[]>([]);
  const [outcomesAvailable, setOutcomesAvailable] = useState(false);
  const [activeOutcomeForecastId, setActiveOutcomeForecastId] = useState<string | null>(null);
  const [savingOutcomeForecastId, setSavingOutcomeForecastId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadForecasts = useCallback(async () => {
    if (!supabase || !session) {
      setLoadingHistory(false);
      return;
    }
    try {
      const forecastRows = await listDonorForecasts(supabase);
      setForecasts(forecastRows);
      const outcomeRows = await listDonorForecastOutcomes(supabase);
      setOutcomes(outcomeRows);
      setOutcomesAvailable(true);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoadingHistory(false);
    }
  }, [session]);

  useEffect(() => { void loadForecasts(); }, [loadForecasts]);

  function update<Key extends keyof ForecastForm>(key: Key, value: ForecastForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !session || busy) {
      setError(supabaseConfigurationError ?? "Sign in as a donor to create a forecast.");
      return;
    }
    const plannedQuantity = Number(form.planned_quantity);
    const expectedCustomers = Number(form.expected_customers);
    const readyDate = new Date(form.ready_at);
    if (!form.ready_at || Number.isNaN(readyDate.getTime()) || readyDate <= new Date()) {
      setError("Choose a future ready date and time.");
      return;
    }
    if (![plannedQuantity, expectedCustomers].every(Number.isFinite) || plannedQuantity <= 0 || expectedCustomers < 0) {
      setError("Enter a planned quantity greater than zero and a non-negative expected customer count.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    setPrediction(null);
    try {
      const input = {
        food_category: form.food_category,
        restaurant_type: form.restaurant_type,
        meal_period: form.meal_period,
        planned_quantity: plannedQuantity,
        expected_customers: expectedCustomers,
        ready_at: readyDate.toISOString(),
      };
      const result = await predictSurplus(supabase, input);
      setPrediction(result.prediction);
      setSuccess("Forecast saved as an estimate. It has not been published as a donation.");
      await loadForecasts();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitOutcome(input: ForecastOutcomeInsert) {
    if (!supabase || !session || savingOutcomeForecastId) {
      setError(supabaseConfigurationError ?? "Sign in as a donor to record an outcome.");
      return;
    }

    setSavingOutcomeForecastId(input.forecast_id);
    setError(null);
    setSuccess(null);
    try {
      const outcome = await createForecastOutcome(supabase, input);
      setOutcomes((current) => [...current, outcome]);
      setOutcomesAvailable(true);
      setActiveOutcomeForecastId(null);
      setSuccess("Observed surplus outcome recorded. Forecast and delivery quantities remain unchanged.");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSavingOutcomeForecastId(null);
    }
  }

  return (
    <DonorShell
      activeLabel="Dashboard"
      action={<Button icon={<ArrowLeft size={16} />} onClick={() => navigate("/donor")} variant="outline">Back to dashboard</Button>}
      description="Use your planning inputs to estimate potential surplus before confirming a donation."
      title="AI Food Surplus Prediction"
    >
      <div className="donor-forecast-layout">
        <main className="donor-forecast-main">
          {error && <ErrorState description={error} />}
          {success && <InlineAlert tone="success">{success}</InlineAlert>}
          <Card padding="lg">
            <SectionHeading description="This demo model uses synthetic hotel history. Enter only information known before preparation begins." title="Prediction inputs" />
            <form className="donor-form-fields" onSubmit={(event) => void submit(event)}>
              <SelectField label="Food category" onChange={(event) => update("food_category", event.target.value)} options={forecastCategories} required value={form.food_category} />
              <SelectField label="Restaurant type" onChange={(event) => update("restaurant_type", event.target.value)} options={restaurantTypes} required value={form.restaurant_type} />
              <SelectField label="Meal period" onChange={(event) => update("meal_period", event.target.value as ForecastForm["meal_period"])} options={mealPeriods} required value={form.meal_period} />
              <TextField label="Planned preparation quantity" min="0.001" onChange={(event) => update("planned_quantity", event.target.value)} required step="0.001" type="number" value={form.planned_quantity} />
              <TextField label="Expected customers / orders" min="0" onChange={(event) => update("expected_customers", event.target.value)} required step="1" type="number" value={form.expected_customers} />
              <TextField className="donor-form-wide" label="Expected food-ready date and time" onChange={(event) => update("ready_at", event.target.value)} required type="datetime-local" value={form.ready_at} />
              <div className="donor-form-wide"><InlineAlert tone="info">Demo Historical Data: the model was trained on fictional synthetic hotel records, not your personal history.</InlineAlert></div>
              <div className="donor-form-actions donor-form-wide">
                <Button disabled={busy} loading={busy} type="submit">{busy ? "Predicting…" : "Predict Food Surplus"}</Button>
                <Link className="donor-text-link" to="/donor/donations/new">Create a confirmed donation instead <ArrowRight size={15} /></Link>
              </div>
            </form>
          </Card>
          {prediction && <Card className="donor-forecast-result" padding="lg">
            <StatusBadge tone="info">Estimate only</StatusBadge>
            <SectionHeading description="This result is not confirmed food availability and does not reserve or publish any donation." title="Predicted surplus" />
            <strong className="donor-forecast-quantity">{prediction.predicted_quantity.toLocaleString()} {prediction.unit}</strong>
            <p>Estimated range: {prediction.uncertainty.lower.toLocaleString()}–{prediction.uncertainty.upper.toLocaleString()} {prediction.unit}</p>
            <div className="donor-forecast-meta"><span>Ready {forecastDateLabel(form.ready_at)}</span><span>Model {prediction.model_version}</span></div>
            <Button icon={<Plus size={16} />} onClick={() => navigate("/donor/donations/new", { state: { forecast: prediction.predicted_quantity } })}>Review confirmed donation</Button>
          </Card>}
        </main>
        <aside>
          <Card padding="lg">
            <SectionHeading description="Only your forecasts are shown here." title="Previous forecasts" />
            {loadingHistory ? <LoadingState label="Loading forecasts" /> : forecasts.length === 0
              ? <EmptyState description="Saved estimates will appear after a successful prediction." title="No forecasts yet" />
              : <div className="donor-forecast-history">{forecasts.map((forecast) => {
                const outcome = outcomes.find((candidate) => candidate.forecast_id === forecast.id);
                const ready = new Date(forecast.ready_at).getTime() < Date.now();
                return (
                  <div className="donor-forecast-history-row" key={forecast.id}>
                    <strong>Predicted: {forecast.predicted_quantity.toLocaleString()} {forecast.unit}</strong>
                    <span>{forecast.food_category.replaceAll("_", " ")} · {forecast.status}</span>
                    <small>Forecast ready {dateLabel(forecast.ready_at)} · created {dateLabel(forecast.created_at)}</small>
                    {outcome ? (
                      <div className="donor-outcome-summary">
                        <strong>Measured surplus: {outcome.actual_surplus_quantity.toLocaleString()} {outcome.unit}</strong>
                        <small>Observed {dateLabel(outcome.observed_at)}</small>
                        {(outcome.actual_sales !== null || outcome.actual_customers !== null) && (
                          <small>
                            {outcome.actual_sales !== null ? `Sales: ${outcome.actual_sales.toLocaleString()}` : ""}
                            {outcome.actual_sales !== null && outcome.actual_customers !== null ? " · " : ""}
                            {outcome.actual_customers !== null ? `Customers / orders: ${outcome.actual_customers.toLocaleString()}` : ""}
                          </small>
                        )}
                      </div>
                    ) : !ready ? (
                      <small>Outcome recording opens after the forecast ready time.</small>
                    ) : !outcomesAvailable ? (
                      <small>Outcome history could not be loaded. Recording is unavailable until it can be checked.</small>
                    ) : activeOutcomeForecastId === forecast.id ? (
                      <ForecastOutcomeForm
                        busy={savingOutcomeForecastId === forecast.id}
                        forecast={forecast}
                        onCancel={() => setActiveOutcomeForecastId(null)}
                        onSubmit={submitOutcome}
                      />
                    ) : (
                      <Button
                        className="donor-outcome-trigger"
                        disabled={Boolean(savingOutcomeForecastId)}
                        onClick={() => setActiveOutcomeForecastId(forecast.id)}
                        size="sm"
                        variant="outline"
                      >
                        Record actual outcome
                      </Button>
                    )}
                  </div>
                );
              })}</div>}
          </Card>
          <InlineAlert tone="info" title="No production history yet">The bundled model was evaluated on synthetic development data. Replace it with real restaurant history before relying on forecasts operationally.</InlineAlert>
        </aside>
      </div>
    </DonorShell>
  );
}

function MonthlyImpactChart({ months }: { months: ReturnType<typeof monthlyCompletedSummary> }) {
  const maximum = Math.max(1, ...months.map((month) => month.completedDonations));
  const summary = months.map((month) => `${month.label}: ${month.completedDonations} completed donations, ${month.kilograms.toLocaleString()} kg`).join(", ");
  return (
    <div aria-label={`Completed donations by month: ${summary}`} className="donor-monthly-chart" role="img">
      <div className="donor-chart-axis"><span>{maximum.toLocaleString()} donations</span><span>0</span></div>
      <div className="donor-chart-bars">
        {months.map((month) => (
          <div className="donor-chart-month" key={month.month}>
            <span className="donor-chart-bar-track"><span className="donor-chart-bar" style={{ height: `${Math.max(3, month.completedDonations / maximum * 100)}%` }} /></span>
            <strong>{month.label}</strong>
            <small>{month.completedDonations} · {month.kilograms.toLocaleString()} kg</small>
          </div>
        ))}
      </div>
    </div>
  );
}

const donationUnits: Array<{ value: DonationRow["unit"]; label: string }> = [
  { value: "servings", label: "Servings" },
  { value: "portions", label: "Portions" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "items", label: "Items" },
];

export function DonationFormPage() {
  const { donationId } = useParams();
  const isEditing = Boolean(donationId);
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState<DonationDraft>({
    food_name: "",
    cuisine_type: "",
    description: "",
    quantity: 1,
    unit: "servings",
    expires_at: "",
    pickup_address: "",
    pickup_latitude: null,
    pickup_longitude: null,
    pickup_instructions: "",
    photo: null,
  });
  const [existingDonation, setExistingDonation] = useState<DonationRow | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!isEditing || !donationId) { setLoading(false); return; }
      if (!supabase || !session) { setError("Sign in to edit a donation."); setLoading(false); return; }
      const { data, error: loadError } = await supabase.from("donations").select("*").eq("id", donationId).eq("donor_id", session.user.id).maybeSingle();
      if (!active) return;
      if (loadError) setError(loadError.message);
      else if (!data) setError("This donation is unavailable or you do not have permission to edit it.");
      else {
        setExistingDonation(data);
        setDraft({
          food_name: data.food_name,
          cuisine_type: data.cuisine_type,
          description: data.description,
          quantity: data.quantity,
          unit: data.unit,
          expires_at: localDateTime(data.expires_at),
          pickup_address: data.pickup_address,
          pickup_latitude: data.pickup_latitude,
          pickup_longitude: data.pickup_longitude,
          pickup_instructions: data.pickup_instructions,
          photo: null,
        });
      }
      setLoading(false);
    }
    void load().catch((caught: unknown) => {
      if (active) { setError(messageOf(caught)); setLoading(false); }
    });
    return () => { active = false; };
  }, [donationId, isEditing, session]);

  function update<Key extends keyof DonationDraft>(key: Key, value: DonationDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectPhoto(file: File | null) {
    setPhotoError(file ? validateFoodImage(file) : null);
    update("photo", file);
  }

  async function save(status: "draft" | "available") {
    if (!supabase || !session) { setError(supabaseConfigurationError ?? "Sign in to save a donation."); return; }
    if (busy) return;
    if (!session.user.id || profile?.id !== session.user.id || profile.role !== "donor") {
      setError("Your donor profile could not be verified. Refresh your account or sign out and sign in again.");
      return;
    }
    const formError = validateDonation(draft, status);
    if (formError) { setError(formError); return; }
    if (draft.photo && validateFoodImage(draft.photo)) { setError(validateFoodImage(draft.photo)); return; }
    if (isEditing && (!existingDonation || !["draft", "available"].includes(existingDonation.status))) {
      setError("This donation can no longer be edited because its workflow has started.");
      return;
    }

    setBusy(true);
    setError(null);
    let uploadedPath: string | null = null;
    try {
      let photoPath = existingDonation?.photo_path ?? null;
      if (draft.photo) {
        uploadedPath = await uploadPrivateImage(supabase, "donation-images", session.user.id, draft.photo);
        photoPath = uploadedPath;
      }
      const values = buildDonationWriteValues({
        food_name: draft.food_name.trim(),
        cuisine_type: draft.cuisine_type.trim(),
        description: draft.description.trim(),
        quantity: draft.quantity,
        unit: draft.unit,
        expires_at: new Date(draft.expires_at).toISOString(),
        pickup_address: draft.pickup_address.trim(),
        pickup_latitude: draft.pickup_latitude ?? null,
        pickup_longitude: draft.pickup_longitude ?? null,
        pickup_instructions: draft.pickup_instructions?.trim() || null,
        photo_path: photoPath,
        status,
      });
      let savedId: string;
      if (isEditing && donationId) {
        const { data, error: saveError } = await supabase.from("donations").update(values).eq("id", donationId).eq("donor_id", session.user.id).select("id").single();
        if (saveError) throw saveError;
        savedId = data.id;
      } else {
        savedId = await createDonation(supabase, session.user.id, values);
      }
      navigate(
        isEditing ? `/donor/donations/${savedId}` : "/donor/donations",
        {
          replace: false,
          state: { success: status === "draft" ? "Draft saved." : "Donation published." },
        },
      );
    } catch (caught) {
      let detail = formatDonationSaveError(caught);
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from("donation-images").remove([uploadedPath]);
        if (cleanupError) detail += ` The uploaded image could not be removed: ${cleanupError.message}`;
      }
      setError(detail);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <DonorShell activeLabel="Create Donation" title={isEditing ? "Edit Donation" : "Create a Donation"}><LoadingState label="Loading donation details" /></DonorShell>;
  if (isEditing && existingDonation && !["draft", "available"].includes(existingDonation.status)) {
    return <DonationDetailsPage />;
  }

  const status = existingDonation?.status ?? "draft";
  return (
    <DonorShell
      activeLabel={isEditing ? "My Donations" : "Create Donation"}
      action={<Button icon={<ArrowLeft size={16} />} onClick={() => navigate("/donor/donations")} variant="outline">Back to donations</Button>}
      description="Share accurate food, quantity, and pickup details with nearby organizations."
      title={isEditing ? "Edit Donation" : "Create a Donation"}
    >
      {location.state && typeof location.state === "object" && "message" in location.state && <InlineAlert tone="success">{String(location.state.message)}</InlineAlert>}
      <div className="donor-form-layout">
        <div className="donor-form-main">
          {error && <ErrorState description={error} />}
          {photoError && <InlineAlert tone="danger">{photoError}</InlineAlert>}
          {isEditing && <InlineAlert tone="info">You can edit this {status} donation only while there are no active pickup requests.</InlineAlert>}
          <Card padding="lg">
            <SectionHeading title="Food Details" description="Describe the surplus food as accurately as possible." />
            <div className="donor-form-fields">
              <TextField label="Food name" maxLength={160} onChange={(event) => update("food_name", event.target.value)} required value={draft.food_name} />
              <TextField label="Cuisine type" maxLength={80} onChange={(event) => update("cuisine_type", event.target.value)} required value={draft.cuisine_type} />
              <TextareaField className="donor-form-wide" label="Description" maxLength={2000} onChange={(event) => update("description", event.target.value)} required rows={3} value={draft.description} />
              <div className="donor-form-quantity">
                <TextField label="Quantity" min="0.001" onChange={(event) => update("quantity", Number(event.target.value))} required step="0.001" type="number" value={Number.isFinite(draft.quantity) ? String(draft.quantity) : ""} />
                <SelectField label="Unit" onChange={(event) => update("unit", event.target.value as DonationRow["unit"])} options={donationUnits} required value={draft.unit} />
              </div>
            </div>
          </Card>
          <Card padding="lg">
            <SectionHeading title="Quantity & Schedule" description="Set a clear expiry time for this listing." />
            <div className="donor-form-fields">
              <TextField label="Available until / expiry" onChange={(event) => update("expires_at", event.target.value)} required type="datetime-local" value={draft.expires_at} />
            </div>
          </Card>
          <Card padding="lg">
            <SectionHeading title="Pickup Information" description="Share the pickup location with authorized request participants." />
            <div className="donor-form-fields">
              <div className="donor-form-wide">
                <LocationInput
                  hint="Coordinates are optional and can be selected by clicking the map."
                  label="Pickup location"
                  onChange={(location) => setDraft((current) => ({ ...current, pickup_address: location.address, pickup_latitude: location.latitude, pickup_longitude: location.longitude }))}
                  required
                  value={{ address: draft.pickup_address, latitude: draft.pickup_latitude ?? null, longitude: draft.pickup_longitude ?? null }}
                />
              </div>
              <TextareaField label="Pickup instructions (optional)" maxLength={1000} onChange={(event) => update("pickup_instructions", event.target.value)} rows={2} value={draft.pickup_instructions ?? ""} />
            </div>
          </Card>
          <Card padding="lg">
            <SectionHeading title="Food Photo" description="Optional · JPG, PNG, or WebP up to 5 MB." />
            <label className="donor-upload-control">
              <input accept="image/jpeg,image/png,image/webp" onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)} type="file" />
              <span><Plus aria-hidden="true" size={20} />{draft.photo?.name ?? (existingDonation?.photo_path ? "Replace food photo" : "Add a food photo")}</span>
            </label>
            {draft.photo && <TemporaryImagePreview file={draft.photo} />}
          </Card>
          <div className="donor-form-actions">
            <Button loading={busy} onClick={() => void save("draft")} type="button" variant="outline">Save as Draft</Button>
            <Button icon={<Check size={16} />} loading={busy} onClick={() => void save("available")} type="button">{isEditing && status === "available" ? "Save Changes" : "Create Donation"}</Button>
          </div>
        </div>
        <aside className="donor-form-aside">
          <Card padding="lg">
            <SectionHeading title="Food Rescue Tips" />
            <ul className="donor-guideline-list">
              <li>Describe the food and quantity honestly.</li>
              <li>Set an expiry time that allows a safe, timely pickup.</li>
              <li>Keep handling and pickup instructions clear.</li>
              <li>Only list food that is eligible under your local rules.</li>
            </ul>
            <p className="donor-chart-note">Submitting a listing does not certify that food is safe. Donors remain responsible for accurate information and applicable food-safety requirements.</p>
          </Card>
          <Card padding="md">
            <Status status={status} />
            <p className="donor-aside-note">Published listings become visible to eligible NGO accounts that can submit pickup requests.</p>
          </Card>
        </aside>
      </div>
    </DonorShell>
  );
}

type DonationFilter = "all" | "active" | "claimed" | "picked_up" | "completed";
const donationFilters: Array<{ value: DonationFilter; label: string }> = [
  { value: "all", label: "All Donations" },
  { value: "active", label: "Active" },
  { value: "claimed", label: "Claimed" },
  { value: "picked_up", label: "Picked Up" },
  { value: "completed", label: "Completed" },
];

export function MyDonationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, error, loading, reload } = useDonorData();
  const [filter, setFilter] = useState<DonationFilter>("all");
  const [cancelTarget, setCancelTarget] = useState<DonationRow | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const donations = useMemo(() => {
    if (!data) return [];
    return data.donations.filter((donation) => {
      if (filter === "all") return true;
      if (filter === "active") return donation.status === "draft" || donation.status === "available";
      return donation.status === filter;
    });
  }, [data, filter]);
  const requestedIds = new Set((data?.requests ?? []).filter((request) => ["pending", "confirmed", "picked_up"].includes(request.status)).map((request) => request.donation_id));
  const success = (location.state as { success?: string } | null)?.success;

  async function cancelDonation() {
    if (!supabase || !cancelTarget || cancelBusy) return;
    setCancelBusy(true);
    setMutationError(null);
    const { error: cancelError } = await supabase.rpc("cancel_donation", { p_donation_id: cancelTarget.id });
    setCancelBusy(false);
    if (cancelError) { setMutationError(cancelError.message); return; }
    setCancelTarget(null);
    await reload();
  }

  return (
    <DonorShell activeLabel="My Donations" action={<Button icon={<Plus size={16} />} onClick={() => navigate("/donor/donations/new")}>Create Donation</Button>} description="Track, edit, or cancel your food listings." title="My Donations">
      {success && <InlineAlert tone="success">{success}</InlineAlert>}
      {mutationError && <ErrorState description={mutationError} />}
      <div aria-label="Filter donations by status" className="donor-filter-tabs" role="tablist">
        {donationFilters.map((option) => (
          <button aria-selected={filter === option.value} className={filter === option.value ? "is-selected" : ""} key={option.value} onClick={() => setFilter(option.value)} role="tab" type="button">
            {option.label}
            {data && <span>{option.value === "all" ? data.donations.length : option.value === "active" ? data.donations.filter((item) => ["draft", "available"].includes(item.status)).length : data.donations.filter((item) => item.status === option.value).length}</span>}
          </button>
        ))}
      </div>
      {loading ? <LoadingState label="Loading your donations" /> : error ? <ErrorState description={error} onRetry={() => void reload()} /> : donations.length === 0
        ? <Card padding="sm"><EmptyState action={<Button icon={<Plus size={16} />} onClick={() => navigate("/donor/donations/new")}>Create Donation</Button>} description={filter === "all" ? "Your food listings will appear here after you create one." : `There are no ${filter.replace("_", " ")} donations in your account.`} title="No donations found" /></Card>
        : <div className="donor-donation-list">{donations.map((donation) => {
          const editable = ["draft", "available"].includes(donation.status) && !requestedIds.has(donation.id);
          const cancellable = ["draft", "available"].includes(donation.status) && !requestedIds.has(donation.id);
          return (
            <DonationRowCard
              donation={donation}
              imageUrl={data?.imageUrls.get(donation.photo_path ?? "")}
              key={donation.id}
              actions={<>
                <Button onClick={() => navigate(`/donor/donations/${donation.id}`)} size="sm" variant="outline">View Details</Button>
                {editable && <Button onClick={() => navigate(`/donor/donations/${donation.id}/edit`)} size="sm" variant="ghost">Edit</Button>}
                {cancellable && <Button onClick={() => setCancelTarget(donation)} size="sm" variant="ghost">Cancel</Button>}
              </>}
            />
          );
        })}</div>}
      <ConfirmationDialog
        busy={cancelBusy}
        confirmLabel="Cancel Donation"
        description={cancelTarget ? `Cancel "${cancelTarget.food_name}"? This can't be undone. Donations with active requests cannot be cancelled.` : ""}
        destructive
        onClose={() => setCancelTarget(null)}
        onConfirm={() => void cancelDonation()}
        open={Boolean(cancelTarget)}
        title="Cancel this donation?"
      />
    </DonorShell>
  );
}

export function DonationDetailsPage() {
  const { donationId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [donation, setDonation] = useState<DonationRow | null>(null);
  const [requests, setRequests] = useState<PickupRequestRow[]>([]);
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!supabase || !session || !donationId) { setError("Donation details are unavailable."); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data: row, error: rowError } = await supabase.from("donations").select("*").eq("id", donationId).eq("donor_id", session.user.id).maybeSingle();
      if (rowError) throw rowError;
      if (!row) throw new Error("This donation is unavailable or you do not have permission to view it.");
      const relatedRequests = await fetchPickupRequests(supabase);
      const requestRows = relatedRequests.filter((request) => request.donation_id === donationId);
      const urls = await fetchSignedImages(supabase, "donation-images", [row.photo_path]);
      setDonation(row);
      setRequests(requestRows);
      setImageUrl(row.photo_path ? urls.get(row.photo_path) : undefined);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, [donationId, session]);

  useEffect(() => { void reload(); }, [reload]);
  const success = (location.state as { success?: string } | null)?.success;

  if (loading) return <DonorShell activeLabel="My Donations" title="Donation Details"><LoadingState label="Loading donation details" /></DonorShell>;
  if (error || !donation) return <DonorShell activeLabel="My Donations" title="Donation Details"><ErrorState description={error ?? "Donation details are unavailable."} onRetry={() => void reload()} /></DonorShell>;
  const canEdit = ["draft", "available"].includes(donation.status)
    && !requests.some((request) => ["pending", "confirmed", "picked_up"].includes(request.status));
  const status = displayedDonationStatus(donation.status, donation.expires_at);

  return (
    <DonorShell activeLabel="My Donations" action={<Button icon={<ArrowLeft size={16} />} onClick={() => navigate("/donor/donations")} variant="outline">Back</Button>} title={donation.food_name}>
      {success && <InlineAlert tone="success">{success}</InlineAlert>}
      <div className="donor-detail-grid">
        <Card className="donor-detail-card" padding="lg">
          <FoodImage className="donor-detail-photo" name={donation.food_name} src={imageUrl} />
          <div className="donor-detail-title"><div><Status status={status} /><h2>{donation.food_name}</h2><p>{donation.cuisine_type} · {formatQuantity(donation.quantity, donation.unit)}</p></div></div>
          <p>{donation.description}</p>
          <div className="donor-detail-fields">
            <DetailField icon={<CalendarClock size={17} />} label="Created" value={dateLabel(donation.created_at)} />
            <DetailField icon={<Clock3 size={17} />} label="Available until" value={dateLabel(donation.expires_at)} />
            <DetailField icon={<MapPin size={17} />} label="Pickup address" value={donation.pickup_address} />
            {donation.pickup_instructions && <DetailField icon={<CircleAlert size={17} />} label="Pickup instructions" value={donation.pickup_instructions} />}
          </div>
          {canEdit && <Button onClick={() => navigate(`/donor/donations/${donation.id}/edit`)} variant="outline">Edit Donation</Button>}
        </Card>
        <Card padding="lg">
          <SectionHeading title="Pickup Requests" description="Related requests visible to your donor account." />
          {requests.length ? requests.map((request) => (
            <Link className="donor-request-summary" key={request.request_id} to={`/donor/requests/${request.request_id}`}>
              <span><strong>{request.organization_name ?? "NGO request"}</strong><small>{formatQuantity(request.requested_quantity, donation.unit)} · {dateLabel(request.created_at)}</small></span>
              <Status status={request.status} />
            </Link>
          )) : <EmptyState description="No organization has requested this donation." title="No pickup requests" />}
        </Card>
      </div>
    </DonorShell>
  );
}

function DetailField({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="donor-detail-field"><span aria-hidden="true">{icon}</span><div><small>{label}</small><p>{value}</p></div></div>;
}

function TemporaryImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img alt="Selected donation food" className="donor-form-photo-preview" src={url} /> : null;
}

type RequestFilter = "all" | "pending" | "confirmed" | "picked_up" | "completed";
const requestFilters: Array<{ value: RequestFilter; label: string }> = [
  { value: "all", label: "All Requests" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "picked_up", label: "Picked Up" },
  { value: "completed", label: "Completed" },
];

export function PickupRequestsPage() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useDonorData();
  const [filter, setFilter] = useState<RequestFilter>("all");
  const [action, setAction] = useState<{ request: PickupRequestRow; action: "confirm" | "decline" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const requests = useMemo(() => data?.requests.filter((request) => filter === "all" || request.status === filter) ?? [], [data, filter]);
  const donationById = useMemo(() => new Map((data?.donations ?? []).map((donation) => [donation.id, donation])), [data]);
  const nextPickup = data?.requests
    .filter((request) => request.status === "confirmed" && request.pickup_at && new Date(request.pickup_at).getTime() >= Date.now())
    .sort((left, right) => (left.pickup_at ?? "").localeCompare(right.pickup_at ?? ""))[0];

  async function reviewRequest() {
    if (!supabase || !action || busy) return;
    setBusy(true);
    setMutationError(null);
    try {
      await reviewPickupRequest(supabase, action.request.request_id, action.action);
      setAction(null);
      await reload();
    } catch (reviewError) {
      setMutationError(messageOf(reviewError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DonorShell activeLabel="Pickup Requests" description="Review and respond to organizations requesting your donations." title="Pickup Requests">
      {mutationError && <ErrorState description={mutationError} />}
      {nextPickup && (
        <Card className="donor-next-pickup" padding="md">
          <div className="donor-next-pickup-icon"><CalendarClock aria-hidden="true" size={21} /></div>
          <div><strong>Next Confirmed Pickup</strong><p>{donationById.get(nextPickup.donation_id)?.food_name ?? "Donation"} · {nextPickup.organization_name ?? "Organization"}</p><small>{dateLabel(nextPickup.pickup_at)}</small></div>
          <Button onClick={() => navigate(`/donor/requests/${nextPickup.request_id}`)} size="sm" variant="outline">View Details</Button>
        </Card>
      )}
      <div aria-label="Filter pickup requests by status" className="donor-filter-tabs" role="tablist">
        {requestFilters.map((option) => (
          <button aria-selected={filter === option.value} className={filter === option.value ? "is-selected" : ""} key={option.value} onClick={() => setFilter(option.value)} role="tab" type="button">
            {option.label}
            {data && <span>{option.value === "all" ? data.requests.length : data.requests.filter((item) => item.status === option.value).length}</span>}
          </button>
        ))}
      </div>
      {loading ? <LoadingState label="Loading pickup requests" /> : error ? <ErrorState description={error} onRetry={() => void reload()} /> : requests.length === 0
        ? <Card padding="sm"><EmptyState description={filter === "all" ? "Requests from eligible NGO accounts will appear here." : `There are no ${filter.replace("_", " ")} requests.`} title="No pickup requests" /></Card>
        : <div className="donor-request-list">{requests.map((request) => {
          const donation = donationById.get(request.donation_id);
          return (
            <Card className="donor-request-card" key={request.request_id} padding="md">
              <div className="donor-request-card-header">
                <div><h2>{request.organization_name ?? "Organization request"}</h2><p>{donation?.food_name ?? "Donation"} · {formatQuantity(request.requested_quantity, donation?.unit ?? "items")}</p></div>
                <Status status={request.status} />
              </div>
              <div className="donor-request-card-meta">
                <span><CalendarClock aria-hidden="true" size={15} />Requested {dateLabel(request.created_at)}</span>
                <span><Clock3 aria-hidden="true" size={15} />Pickup {dateLabel(request.pickup_at)}</span>
              </div>
              {request.contact_name && <p className="donor-authorized-contact">Contact: {request.contact_name}{request.contact_phone ? ` · ${request.contact_phone}` : ""}{request.contact_email ? ` · ${request.contact_email}` : ""}</p>}
              <div className="donor-request-actions">
                <Button onClick={() => navigate(`/donor/requests/${request.request_id}`)} size="sm" variant="outline">View Details</Button>
                {request.status === "pending" && <>
                  <Button onClick={() => setAction({ request, action: "decline" })} size="sm" variant="ghost">Decline</Button>
                  <Button onClick={() => setAction({ request, action: "confirm" })} size="sm">Confirm</Button>
                </>}
                {request.status === "confirmed" && <Button onClick={() => navigate(`/donor/requests/${request.request_id}`)} size="sm">Pickup Details</Button>}
              </div>
            </Card>
          );
        })}</div>}
      <ConfirmationDialog
        busy={busy}
        confirmLabel={action?.action === "decline" ? "Decline Request" : "Confirm Request"}
        description={action ? `${action.action === "decline" ? "Decline" : "Confirm"} the pickup request from ${action.request.organization_name ?? "this organization"}? This decision is recorded and cannot be changed here.` : ""}
        destructive={action?.action === "decline"}
        onClose={() => setAction(null)}
        onConfirm={() => void reviewRequest()}
        open={Boolean(action)}
        title={action?.action === "decline" ? "Decline this request?" : "Confirm this pickup request?"}
      />
    </DonorShell>
  );
}

type HandoverRow = Database["public"]["Tables"]["donation_handovers"]["Row"];

export function PickupRequestDetailsPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [request, setRequest] = useState<PickupRequestRow | null>(null);
  const [donation, setDonation] = useState<DonationRow | null>(null);
  const [handover, setHandover] = useState<HandoverRow | null>(null);
  const [volunteerAssigned, setVolunteerAssigned] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase || !session || !requestId) { setError("Pickup request details are unavailable."); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const requestRows = await fetchPickupRequests(supabase);
      const requestRow = requestRows.find((row) => row.request_id === requestId);
      if (!requestRow) throw new Error("This pickup request is unavailable or not related to your donations.");
      const assigned = await fetchPickupRequestVolunteerAssignment(supabase, requestId);
      const { data: donationRow, error: donationError } = await supabase.from("donations").select("*").eq("id", requestRow.donation_id).eq("donor_id", session.user.id).single();
      if (donationError) throw donationError;
      const { data: handoverRow, error: handoverError } = await supabase.from("donation_handovers").select("*").eq("pickup_request_id", requestId).maybeSingle();
      if (handoverError) throw handoverError;
      const photoUrls = await fetchSignedImages(supabase, "donation-images", [donationRow.photo_path]);
      setRequest(requestRow);
      setDonation(donationRow);
      setHandover(handoverRow);
      setVolunteerAssigned(assigned);
      setImageUrl(donationRow.photo_path ? photoUrls.get(donationRow.photo_path) : undefined);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, [requestId, session]);

  useEffect(() => { void reload(); }, [reload]);

  async function confirmHandover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session || !request) { setError("Your session or pickup request is unavailable."); return; }
    if (busy) return;
    if (photo) {
      const imageError = validateFoodImage(photo);
      if (imageError) { setError(imageError); return; }
    }
    setBusy(true);
    setError(null);
    let uploadedPath: string | null = null;
    try {
      if (photo) uploadedPath = await uploadPrivateImage(supabase, "handover-evidence", session.user.id, photo);
      const { error: confirmError } = await supabase.rpc("confirm_donor_handover", {
        p_request_id: request.request_id,
        p_photo_path: uploadedPath,
        p_note: note.trim() || null,
      });
      if (confirmError) throw confirmError;
      await reload();
    } catch (cause) {
      let detail = messageOf(cause);
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from("handover-evidence").remove([uploadedPath]);
        if (cleanupError) detail += ` The uploaded photo could not be removed: ${messageOf(cleanupError)}`;
      }
      setError(detail);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <DonorShell activeLabel="Pickup Requests" title="Pickup Details & Handover"><LoadingState label="Loading pickup details" /></DonorShell>;
  if (error || !request || !donation) return <DonorShell activeLabel="Pickup Requests" title="Pickup Details & Handover"><ErrorState description={error ?? "Pickup details are unavailable."} onRetry={() => void reload()} /></DonorShell>;

  const canHandover = canConfirmDonorHandover(request.status, donation.status, volunteerAssigned);
  const steps = [
    { label: "Request received", detail: dateLabel(request.created_at), state: "complete" as const },
    { label: "Pickup confirmed", detail: request.status === "pending" ? "Waiting for your response" : undefined, state: request.status === "pending" ? "current" as const : "complete" as const },
    { label: "Food handed over", detail: request.status === "picked_up" || request.status === "completed" ? (handover ? dateLabel(handover.recorded_at) : "Handover recorded") : "Donor handover confirmation", state: request.status === "picked_up" || request.status === "completed" ? "complete" as const : request.status === "confirmed" ? "current" as const : "upcoming" as const },
    { label: "Recipient receipt", detail: request.status === "completed" ? "Receipt confirmed by recipient" : "Confirmed by the receiving organization", state: request.status === "completed" ? "complete" as const : "upcoming" as const },
  ];

  return (
    <DonorShell activeLabel="Pickup Requests" action={<Button icon={<ArrowLeft size={16} />} onClick={() => navigate("/donor/requests")} variant="outline">Back to Requests</Button>} title="Pickup Details & Handover">
      {error && <ErrorState description={error} />}
      <div className="donor-detail-grid">
        <Card className="donor-detail-card" padding="lg">
          <div className="donor-request-card-header"><div><h2>{donation.food_name}</h2><p>{request.organization_name ?? "Requesting organization"}</p></div><Status status={request.status} /></div>
          <FoodImage className="donor-detail-photo" name={donation.food_name} src={imageUrl} />
          <div className="donor-detail-fields">
            <DetailField icon={<PackageCheck size={17} />} label="Requested quantity" value={formatQuantity(request.requested_quantity, donation.unit)} />
            <DetailField icon={<CalendarClock size={17} />} label="Pickup time" value={dateLabel(request.pickup_at)} />
            <DetailField icon={<MapPin size={17} />} label="Pickup address" value={donation.pickup_address} />
            {donation.pickup_instructions && <DetailField icon={<CircleAlert size={17} />} label="Pickup instructions" value={donation.pickup_instructions} />}
          </div>
          {request.contact_name && <div className="donor-contact-card"><strong>Authorized organization contact</strong><p>{request.contact_name}</p>{request.contact_phone && <p>{request.contact_phone}</p>}{request.contact_email && <p>{request.contact_email}</p>}</div>}
          <SectionHeading title="Pickup Progress" />
          <ProgressTimeline steps={steps} />
          {request.status === "completed" && request.received_quantity !== null && request.receipt_confirmed_at && (
            <InlineAlert tone="success" title="Recipient receipt confirmed">
              {formatQuantity(request.received_quantity, donation.unit)} was confirmed on {dateLabel(request.receipt_confirmed_at)}.
            </InlineAlert>
          )}
        </Card>
        <div className="donor-handover-side">
          {canHandover ? (
            <Card padding="lg">
              <SectionHeading title="Confirm Food Handover" description="Record what was actually handed to the receiving organization." />
              <form className="donor-form-fields" onSubmit={(event) => void confirmHandover(event)}>
                {error && <ErrorState description={error} />}
                <DetailField icon={<PackageCheck size={17} />} label="Confirmed quantity" value={formatQuantity(request.requested_quantity, donation.unit)} />
                <p>Pickup requests reserve the full listed quantity. Confirm handover only if that complete quantity was collected.</p>
                <TextareaField label="Handover note (optional)" maxLength={1000} onChange={(event) => setNote(event.target.value)} value={note} />
                <label className="donor-upload-control"><input accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} type="file" /><span><Plus size={18} />{photo?.name ?? "Add optional handover photo"}</span></label>
                {photo && validateFoodImage(photo) && <InlineAlert tone="danger">{validateFoodImage(photo)}</InlineAlert>}
                <InlineAlert tone="info">This records donor handover only. The donation is not marked completed until the recipient confirms receipt.</InlineAlert>
                <Button loading={busy} type="submit">Confirm Handover</Button>
              </form>
            </Card>
          ) : volunteerAssigned && request.status === "confirmed" ? (
            <Card padding="lg">
              <SectionHeading title="Volunteer Pickup Assigned" />
              <InlineAlert tone="info">The assigned volunteer will confirm pickup and record the handover after collecting the food.</InlineAlert>
            </Card>
          ) : handover ? (
            <Card padding="lg">
              <SectionHeading title="Handover Recorded" />
              <Status status="picked_up" />
              <p>{formatQuantity(handover.quantity_handed_over, donation.unit)} · {dateLabel(handover.recorded_at)}</p>
              {handover.note && <p>{handover.note}</p>}
              {handover.photo_path && <HandoverPhoto path={handover.photo_path} />}
              <InlineAlert tone="info">Receipt confirmation by the recipient is a separate workflow. This handover does not mark the donation complete.</InlineAlert>
            </Card>
          ) : <Card padding="lg"><SectionHeading title="Handover" /><p>Handover confirmation becomes available after this request is confirmed.</p></Card>}
        </div>
      </div>
    </DonorShell>
  );
}

function HandoverPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { setError(supabaseConfigurationError); return; }
      const urls = await fetchSignedImages(supabase, "handover-evidence", [path]);
      if (active) setUrl(urls.get(path) ?? null);
    }
    void load().catch((cause: unknown) => { if (active) setError(messageOf(cause)); });
    return () => { active = false; };
  }, [path]);
  if (error) return <InlineAlert tone="danger">{error}</InlineAlert>;
  return url ? <img alt="Private handover evidence" className="donor-handover-photo" src={url} /> : <LoadingState label="Loading private handover photo" />;
}

export function DonorImpactPage() {
  const [records, setRecords] = useState<CompletedImpactRow[]>([]);
  const [period, setPeriod] = useState("12");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!supabase) { setError(supabaseConfigurationError); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setRecords(await fetchCompletedImpact(supabase));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - Number(period));
    return records.filter((record) => new Date(record.completed_at).getTime() >= cutoff.getTime());
  }, [records, period]);
  const metrics = calculateDonorImpact(filtered);
  const monthly = monthlyCompletedSummary(filtered, Number(period));
  const cuisineCounts = filtered.reduce<Map<string, number>>((map, row) => {
    map.set(row.cuisine_type, (map.get(row.cuisine_type) ?? 0) + 1);
    return map;
  }, new Map());
  const cuisines = [...cuisineCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <DonorShell activeLabel="Impact" action={<SelectField aria-label="Impact reporting period" label="Period" onChange={(event) => setPeriod(event.target.value)} options={[{ value: "1", label: "Last month" }, { value: "3", label: "Last 3 months" }, { value: "6", label: "Last 6 months" }, { value: "12", label: "Last 12 months" }]} value={period} />} description="Impact is based on completed donation records and reported quantities only." title="Your Impact">
      {error && <ErrorState description={error} onRetry={() => void reload()} />}
      {loading ? <LoadingState label="Calculating completed impact" /> : error ? null : <>
        <section aria-label="Completed donor impact metrics" className="donor-stat-grid">
          <StatCard detail="Units explicitly recorded as servings" icon={<Utensils size={19} />} label="Meals donated" value={metrics.mealsDonated.toLocaleString()} />
          <StatCard detail="Completed quantity explicitly recorded in kilograms" icon={<Leaf size={19} />} label="Food saved" tone="mint" value={`${metrics.foodSavedKg.toLocaleString()} kg`} />
          <StatCard detail="No verified recipient count is stored" icon={<UsersRound size={19} />} label="People fed" tone="amber" value="—" />
          <StatCard detail="No approved conversion factor is configured" icon={<ArrowDownRight size={19} />} label="CO₂ reduced" tone="blue" value="—" />
        </section>
        {filtered.length === 0
          ? <Card padding="sm"><EmptyState description="Completed recipient-confirmed donations will appear here. Drafts, active listings, and pickups awaiting recipient receipt are excluded." title="No completed impact for this period" /></Card>
          : <div className="donor-dashboard-lower">
            <Card padding="lg"><SectionHeading description="Verified kilograms from recipient-confirmed donations." title="Donation Trends" /><MonthlyImpactChart months={monthly} /></Card>
            <Card padding="lg"><SectionHeading description="Completed donation records grouped by cuisine." title="Donations by Cuisine" />
              {cuisines.length ? <div className="donor-cuisine-list">{cuisines.map(([cuisine, count]) => <div className="donor-cuisine-row" key={cuisine}><span>{cuisine}</span><strong>{count} {count === 1 ? "donation" : "donations"}</strong></div>)}</div> : <p>No cuisine data for this period.</p>}
            </Card>
          </div>}
        <InlineAlert tone="info" title="How these metrics are calculated">
          Only recipient-confirmed completed records are included. Meal totals count records with the explicit “servings” unit; food weight counts records in kg. “Portions” and “items” are not converted. People fed and CO₂ reduction are not estimated because no verified recipient counts or approved emissions factor exist.
        </InlineAlert>
      </>}
    </DonorShell>
  );
}
