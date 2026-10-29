import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  FileCheck2,
  Heart,
  MapPin,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
  Utensils,
} from "lucide-react";
import { AppShell, PageHeader } from "../components/layout";
import { LocationInput } from "../components/location-input";
import {
  Button,
  Card,
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
} from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import { fetchSignedImages } from "../lib/storage";
import {
  createNgoDocumentUrl,
  createPickupRequest,
  buildPickupRequestValues,
  fetchActiveNgoRequest,
  fetchAvailableDonations,
  fetchDonation,
  fetchHandover,
  fetchNgoProfile,
  fetchNgoRequest,
  fetchNgoRequests,
  fetchRequestHistory,
  reportNgoDeliveryIssue,
  type NgoDonation,
  type NgoHandover,
  type NgoProfile,
  type NgoRequest,
  type NgoRequestHistory,
} from "./data";
import {
  filterNgoDeliveries,
  filterNgoRequests,
  matchesNgoRequest,
  ngoRequestLabel,
  ngoRequestTone,
  summarizeNgoRequests,
  isAwaitingNgoVerification,
  type NgoDeliveryFilter,
  type NgoRequestFilter,
} from "./metrics";
import { validatePickupRequest, validateReceiptQuantity } from "./validation";

type LoadState<T> =
  | { data: T; error: null; loading: false }
  | { data: null; error: string; loading: false }
  | { data: null; error: null; loading: true };

type NgoDonationView = NgoDonation & { photoUrl: string | null };

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function pickupRequestFailure(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    if (error.code === "23505" && message.includes("pickup_requests_one_active_per_ngo")) {
      return {
        message: "Your organization already has an active request for this donation.",
        hasActiveRequest: true,
      };
    }
    if (error.code === "P0001") {
      return {
        message: "The request was not accepted. The donation may no longer be available or the request may not match the current eligibility requirements. Refresh the listings and try again.",
        hasActiveRequest: false,
      };
    }
  }
  return { message: messageOf(error), hasActiveRequest: false };
}

function dateLabel(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Invalid date"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatQuantity(quantity: number, unit: NgoDonation["unit"]) {
  return `${Number(quantity).toLocaleString()} ${unit}`;
}

function NgoShell({
  activeLabel,
  children,
  title,
  description,
  action,
}: {
  activeLabel: string;
  children: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const { profile, session } = useAuth();
  const userName = profile?.full_name ?? session?.user.email ?? "Organization";
  return (
    <AppShell activeLabel={activeLabel} role="ngo" userName={userName}>
      <PageHeader action={action} description={description} title={title} />
      {children}
    </AppShell>
  );
}

function useNgoRequests() {
  const { session } = useAuth();
  const [state, setState] = useState<LoadState<NgoRequest[]>>({ data: null, error: null, loading: true });
  const reload = useCallback(async () => {
    if (!supabase || !session) {
      setState({ data: null, error: supabaseConfigurationError ?? "Sign in to load organization requests.", loading: false });
      return;
    }
    setState({ data: null, error: null, loading: true });
    try {
      setState({ data: await fetchNgoRequests(supabase, session.user.id), error: null, loading: false });
    } catch (error) {
      setState({ data: null, error: messageOf(error), loading: false });
    }
  }, [session]);
  useEffect(() => { void reload(); }, [reload]);
  return { ...state, reload };
}

function RequestStatus({ request }: { request: NgoRequest }) {
  return <StatusBadge tone={ngoRequestTone(request.status)}>{ngoRequestLabel(request.status)}</StatusBadge>;
}

function FoodPhoto({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (src && !failed) {
    return <img alt={`${name} food photo`} className="ngo-food-photo" onError={() => setFailed(true)} src={src} />;
  }
  return (
    <div aria-label={`${name}: food photo unavailable`} className="ngo-food-placeholder" role="img">
      <Utensils aria-hidden="true" size={25} />
      <span>Food photo unavailable</span>
    </div>
  );
}

function DonationCard({ donation, action }: { donation: NgoDonationView; action: ReactNode }) {
  return (
    <article className="ngo-donation-card">
      <FoodPhoto name={donation.food_name} src={donation.photoUrl} />
      <div className="ngo-donation-copy">
        <div className="ngo-donation-heading">
          <h2>{donation.food_name}</h2>
          <StatusBadge tone="success">Available</StatusBadge>
        </div>
        <p>{donation.cuisine_type} · {formatQuantity(donation.quantity, donation.unit)}</p>
        <div className="ngo-meta">
          <span><Clock3 aria-hidden="true" size={14} /> Expires {dateLabel(donation.expires_at)}</span>
          <span><CalendarClock aria-hidden="true" size={14} /> Listed {dateLabel(donation.created_at)}</span>
        </div>
      </div>
      <div className="ngo-donation-actions">{action}</div>
    </article>
  );
}

function RequestCard({ request, action }: { request: NgoRequest; action?: ReactNode }) {
  return (
    <article className="ngo-request-card">
      <div className="ngo-request-card-main">
        <span className="ngo-request-icon"><PackageCheck aria-hidden="true" size={20} /></span>
        <div>
          <h2>Request {request.id.slice(0, 8).toUpperCase()}</h2>
          <p>Donation reference {request.donation_id.slice(0, 8).toUpperCase()}</p>
          <div className="ngo-meta">
            <span>{request.requested_quantity.toLocaleString()} requested</span>
            <span><CalendarClock aria-hidden="true" size={14} /> {dateLabel(request.pickup_at)}</span>
          </div>
        </div>
      </div>
      <div className="ngo-request-card-actions"><RequestStatus request={request} />{request.delivery_verification_status === "issue_reported" && <StatusBadge tone="danger">Issue reported</StatusBadge>}{request.delivery_verification_status === "pending" && request.volunteer_delivered_at && <StatusBadge tone="warning">Awaiting verification</StatusBadge>}{action}</div>
    </article>
  );
}

function FilterTabs<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; text: string }>;
  selected: T;
  onChange: (value: T) => void;
}) {
  return (
    <div aria-label={label} className="ngo-filter-tabs" role="group">
      {options.map((option) => (
        <button
          aria-pressed={selected === option.value}
          className={selected === option.value ? "is-selected" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

export function NgoDashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: requests, error, loading, reload } = useNgoRequests();
  const [available, setAvailable] = useState<LoadState<NgoDonationView[]>>({ data: null, error: null, loading: true });
  const displayName = profile?.full_name?.split(/\s+/)[0] ?? "there";

  const loadAvailable = useCallback(async () => {
    if (!supabase) {
      setAvailable({ data: null, error: supabaseConfigurationError ?? "Supabase is not configured.", loading: false });
      return;
    }
    setAvailable({ data: null, error: null, loading: true });
    try {
      const donations = await fetchAvailableDonations(supabase);
      const imageUrls = await fetchSignedImages(supabase, "donation-images", donations.map((donation) => donation.photo_path));
      setAvailable({
        data: donations.map((donation) => ({
          ...donation,
          photoUrl: donation.photo_path ? imageUrls.get(donation.photo_path) ?? null : null,
        })),
        error: null,
        loading: false,
      });
    } catch (cause) {
      setAvailable({ data: null, error: messageOf(cause), loading: false });
    }
  }, []);
  useEffect(() => { void loadAvailable(); }, [loadAvailable]);
  const summary = useMemo(() => summarizeNgoRequests(requests ?? []), [requests]);
  const recent = requests?.slice(0, 3) ?? [];

  return (
    <NgoShell activeLabel="Dashboard" title={`Welcome, ${displayName}!`} description="Find safe surplus food for the people you serve.">
      <div className="ngo-page-stack">
        {(error || available.error) && <ErrorState description={error ?? available.error ?? "Could not load organization data."} onRetry={() => { void reload(); void loadAvailable(); }} />}
        <section aria-label="Organization activity" className="ngo-stat-grid">
          <StatCard detail="Requests awaiting donor response" icon={<Clock3 size={19} />} label="Pending requests" value={loading ? "…" : String(summary.pending)} tone="amber" />
          <StatCard detail="Accepted and in-transit requests" icon={<PackageCheck size={19} />} label="Active pickups" value={loading ? "…" : String(summary.active)} tone="mint" />
          <StatCard detail="Recipient-confirmed request records" icon={<Check size={19} />} label="Receipts confirmed" value={loading ? "…" : String(summary.completed)} />
          <StatCard detail="Visible to this organization's access" icon={<Heart size={19} />} label="Available donations" value={available.loading ? "…" : available.error ? "—" : String(available.data?.length ?? 0)} tone="blue" />
        </section>
        <section className="ngo-promo">
          <div>
            <span>Food rescue starts nearby</span>
            <h2>Find good food for your community</h2>
            <p>Explore current listings and request a full-donation pickup.</p>
            <Button onClick={() => navigate("/ngo/donations")}>Browse donations</Button>
          </div>
          <div aria-hidden="true" className="ngo-promo-art"><Heart size={70} strokeWidth={1.2} /><UsersRound size={42} /></div>
        </section>
        <div className="ngo-dashboard-grid">
          <Card padding="md">
            <SectionHeading
              action={<Link className="ngo-text-link" to="/ngo/requests">View all <ArrowRight size={15} /></Link>}
              description="Recent requests and their latest status."
              title="My Requests"
            />
            {loading ? <LoadingState label="Loading your requests" /> : error ? null : recent.length
              ? <div className="ngo-card-list">{recent.map((request) => (
                <RequestCard action={<Link aria-label={`View request ${request.id}`} className="ngo-icon-link" to={`/ngo/requests/${request.id}`}>Details</Link>} key={request.id} request={request} />
              ))}</div>
              : <EmptyState description="Requests you submit will appear here with their current status." title="No requests yet" />}
          </Card>
          <Card padding="md">
            <SectionHeading
              action={<Button icon={<RefreshCw size={15} />} loading={available.loading} onClick={() => void loadAvailable()} variant="outline">Refresh</Button>}
              description="Location data isn't available for this account."
              title="Nearby donations"
            />
            {available.loading ? <LoadingState label="Checking available donations" /> : available.error ? null : (available.data?.length ?? 0) > 0
              ? <div className="ngo-mini-list">{(available.data ?? []).slice(0, 3).map((donation) => (
                <Link className="ngo-mini-row" key={donation.id} to={`/ngo/donations/${donation.id}`}>
                  <FoodPhoto name={donation.food_name} src={donation.photoUrl} />
                  <span><strong>{donation.food_name}</strong><small>{donation.cuisine_type} · {formatQuantity(donation.quantity, donation.unit)}</small></span>
                  <ArrowRight size={16} />
                </Link>
              ))}</div>
              : <EmptyState description="No donation listings are currently visible to this organization. Listing visibility depends on the active database access policies." title="No visible donations" />}
            <InlineAlert tone="info">A live map and distance sorting are unavailable because the current donation schema has no coordinates or geographic search.</InlineAlert>
          </Card>
        </div>
      </div>
    </NgoShell>
  );
}

export function AvailableDonationsPage() {
  const [state, setState] = useState<LoadState<NgoDonationView[]>>({ data: null, error: null, loading: true });
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState("all");
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) {
        setState({ data: null, error: supabaseConfigurationError ?? "Supabase is not configured.", loading: false });
        return;
      }
      setState({ data: null, error: null, loading: true });
      try {
        const donations = await fetchAvailableDonations(supabase);
        const imageUrls = await fetchSignedImages(supabase, "donation-images", donations.map((donation) => donation.photo_path));
        if (active) setState({
          data: donations.map((donation) => ({
            ...donation,
            photoUrl: donation.photo_path ? imageUrls.get(donation.photo_path) ?? null : null,
          })),
          error: null,
          loading: false,
        });
      } catch (cause) {
        if (active) setState({ data: null, error: messageOf(cause), loading: false });
      }
    }
    void load();
    return () => { active = false; };
  }, [reloadKey]);

  const cuisines = useMemo(() => [...new Set(state.data?.map((row) => row.cuisine_type) ?? [])].sort(), [state.data]);
  const donations = useMemo(() => (state.data ?? []).filter((row) =>
    (cuisine === "all" || row.cuisine_type === cuisine)
    && `${row.food_name} ${row.cuisine_type} ${row.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  ), [cuisine, query, state.data]);

  return (
    <NgoShell
      activeLabel="Available Donations"
      action={<Button icon={<RefreshCw size={15} />} loading={state.loading} onClick={() => setReloadKey((key) => key + 1)} variant="outline">Refresh</Button>}
      title="Available Donations"
      description="Browse food listings that may be requested by your organization."
    >
      <div className="ngo-page-stack">
        <div className="ngo-list-controls">
          <label className="ngo-search">
            <Search aria-hidden="true" size={18} />
            <input aria-label="Search donations" onChange={(event) => setQuery(event.target.value)} placeholder="Search food or cuisine" value={query} />
          </label>
          <label className="ngo-cuisine-filter">
            <span>Cuisine</span>
            <select aria-label="Filter by cuisine" onChange={(event) => setCuisine(event.target.value)} value={cuisine}>
              <option value="all">All cuisines</option>
              {cuisines.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        {state.error && <ErrorState description={state.error} onRetry={() => setReloadKey((key) => key + 1)} />}
        {state.loading ? <LoadingState label="Loading available donations" /> : state.error ? null : donations.length
          ? <div className="ngo-donation-list">{donations.map((donation) => (
            <DonationCard
              action={<>
                <Link className="ngo-button-link ngo-button-link--outline" to={`/ngo/donations/${donation.id}`}>View details</Link>
                <Link className="ngo-button-link" to={`/ngo/donations/${donation.id}/request`}>Request pickup</Link>
              </>}
              donation={donation}
              key={donation.id}
            />
          ))}</div>
          : <EmptyState
            action={query || cuisine !== "all" ? <Button onClick={() => { setQuery(""); setCuisine("all"); }} variant="outline">Clear filters</Button> : undefined}
            description="No donation listings are currently visible to this organization. The active database access policy controls which listings can be discovered."
            title={query || cuisine !== "all" ? "No matching donations" : "No visible donations"}
          />}
      </div>
    </NgoShell>
  );
}

function DonationDetailsContent({ donation, action }: { donation: NgoDonationView; action: ReactNode }) {
  return (
    <div className="ngo-detail-grid">
      <Card className="ngo-detail-card" padding="lg">
        <FoodPhoto name={donation.food_name} src={donation.photoUrl} />
        <div className="ngo-detail-heading"><div><StatusBadge tone="success">Available</StatusBadge><h2>{donation.food_name}</h2><p>{donation.cuisine_type}</p></div></div>
        <p>{donation.description}</p>
        <div className="ngo-detail-fields">
          <div><Utensils size={17} /><span><small>Available quantity</small><strong>{formatQuantity(donation.quantity, donation.unit)}</strong></span></div>
          <div><Clock3 size={17} /><span><small>Available until</small><strong>{dateLabel(donation.expires_at)}</strong></span></div>
        </div>
        <InlineAlert tone="info">An NGO account can request an available donation. Donor contact details and pickup instructions are not shown before an accepted request.</InlineAlert>
        {action}
      </Card>
      <Card padding="lg">
        <SectionHeading title="Pickup details" />
        <div className="ngo-detail-fields">
          <div><MapPin size={17} /><span><small>Pickup location</small><strong>Shared after donor approval</strong></span></div>
          <div><ShieldCheck size={17} /><span><small>Food handling</small><strong>Review the donor's instructions after approval.</strong></span></div>
        </div>
        <InlineAlert tone="warning">Only authorized NGO accounts can browse listings. Donor contact and exact pickup details remain restricted until the request is approved.</InlineAlert>
      </Card>
    </div>
  );
}

export function NgoDonationDetailsPage() {
  const { donationId = "" } = useParams();
  const [state, setState] = useState<LoadState<NgoDonationView>>({ data: null, error: null, loading: true });
  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) {
        setState({ data: null, error: supabaseConfigurationError ?? "Supabase is not configured.", loading: false });
        return;
      }
      try {
        const donation = await fetchDonation(supabase, donationId);
        if (donation) {
          const imageUrls = await fetchSignedImages(supabase, "donation-images", [donation.photo_path]);
          if (active) setState({
            data: {
              ...donation,
              photoUrl: donation.photo_path ? imageUrls.get(donation.photo_path) ?? null : null,
            },
            error: null,
            loading: false,
          });
        } else if (active) {
          setState({ data: null, error: "This donation is unavailable or is not visible under your organization's current access rules.", loading: false });
        }
      } catch (cause) {
        if (active) setState({ data: null, error: messageOf(cause), loading: false });
      }
    }
    void load();
    return () => { active = false; };
  }, [donationId]);

  return (
    <NgoShell activeLabel="Available Donations" title="Donation Details" action={<Link className="ngo-button-link ngo-button-link--outline" to="/ngo/donations"><ArrowLeft size={15} /> Back to donations</Link>}>
      {state.loading ? <LoadingState label="Loading donation details" /> : state.error
        ? <ErrorState description={state.error} />
        : state.data && <DonationDetailsContent donation={state.data} action={<Link className="ngo-button-link" to={`/ngo/donations/${state.data.id}/request`}>Request pickup</Link>} />}
    </NgoShell>
  );
}

export function RequestPickupPage() {
  const { donationId = "" } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [donation, setDonation] = useState<NgoDonationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickupAt, setPickupAt] = useState("");
  const [notes, setNotes] = useState("");
  const [dropoff, setDropoff] = useState({ address: "", latitude: null as number | null, longitude: null as number | null });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasActiveRequest, setHasActiveRequest] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { setError(supabaseConfigurationError); setLoading(false); return; }
      if (!session) { setError("Sign in again before requesting a pickup."); setLoading(false); return; }
      try {
        const result = await fetchDonation(supabase, donationId);
        if (!active) return;
        if (!result) setError("This donation is unavailable or is not visible under your organization's current access rules.");
        else {
          const imageUrls = await fetchSignedImages(supabase, "donation-images", [result.photo_path]);
          setDonation({
            ...result,
            photoUrl: result.photo_path ? imageUrls.get(result.photo_path) ?? null : null,
          });
        }
      } catch (cause) {
        if (active) setError(messageOf(cause));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [donationId, session]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) { setError(supabaseConfigurationError ?? "Sign in again before requesting a pickup."); return; }
    if (!donation) { setError("Donation details are not available."); return; }
    const validationError = validatePickupRequest(pickupAt, notes);
    if (validationError) { setError(validationError); return; }
    setBusy(true);
    setError(null);
    setHasActiveRequest(false);
    try {
      const activeRequest = await fetchActiveNgoRequest(supabase, session.user.id, donation.id);
      if (activeRequest) {
        setError("Your organization already has an active request for this donation.");
        setHasActiveRequest(true);
        return;
      }
      const requestValues = buildPickupRequestValues({
        donation_id: donation.id,
        ngo_id: session.user.id,
        requested_quantity: donation.quantity,
        pickup_at: new Date(pickupAt).toISOString(),
        notes: notes.trim() || null,
        dropoff_address: dropoff.address.trim() || null,
        dropoff_latitude: dropoff.latitude,
        dropoff_longitude: dropoff.longitude,
      });
      const data = await createPickupRequest(supabase, requestValues);
      navigate(`/ngo/requests/${data.id}/submitted`, { state: { requestId: data.id } });
    } catch (cause) {
      const failure = pickupRequestFailure(cause);
      setError(failure.message);
      setHasActiveRequest(failure.hasActiveRequest);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <NgoShell activeLabel="Available Donations" title="Request Pickup"><LoadingState label="Loading selected donation" /></NgoShell>;
  return (
    <NgoShell activeLabel="Available Donations" title="Request Pickup" description="Send a pickup request to the donor.">
      {error && !donation ? <ErrorState description={error} /> : donation && (
        <form className="ngo-request-form-layout" onSubmit={(event) => void submit(event)}>
          <Card className="ngo-form-card" padding="lg">
            {error && (
              <InlineAlert tone="danger">
                {error}
                {hasActiveRequest && <> <Link to="/ngo/requests">Review your requests</Link>.</>}
              </InlineAlert>
            )}
            <SectionHeading description="The current workflow requests the full donation quantity." title="Pickup details" />
            <div className="ngo-selected-donation"><FoodPhoto name={donation.food_name} src={donation.photoUrl} /><span><strong>{donation.food_name}</strong><small>{donation.cuisine_type} · {formatQuantity(donation.quantity, donation.unit)}</small></span></div>
            <TextField
              label="Preferred pickup date and time"
              min={new Date(Date.now() + 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)}
              onChange={(event) => setPickupAt(event.target.value)}
              required
              type="datetime-local"
              value={pickupAt}
            />
            <LocationInput
              hint="Optional: use your organization address or select the drop-off point on the map."
              label="NGO drop-off location"
              onChange={setDropoff}
              value={dropoff}
            />
            <TextareaField label="Additional notes (optional)" maxLength={1000} onChange={(event) => setNotes(event.target.value)} rows={4} value={notes} />
            <div className="ngo-form-actions">
              <Link className="ngo-button-link ngo-button-link--outline" to={`/ngo/donations/${donation.id}`}>Back</Link>
              <Button loading={busy} type="submit">Submit pickup request</Button>
            </div>
          </Card>
          <Card padding="lg">
            <SectionHeading title="Request summary" />
            <div className="ngo-summary-row"><span>Food</span><strong>{donation.food_name}</strong></div>
            <div className="ngo-summary-row"><span>Requested quantity</span><strong>{formatQuantity(donation.quantity, donation.unit)}</strong></div>
            <div className="ngo-summary-row"><span>Request status</span><StatusBadge tone="warning">Pending donor approval</StatusBadge></div>
            <InlineAlert tone="info">The database checks NGO ownership, donation availability, full-quantity requests, and duplicate active requests.</InlineAlert>
          </Card>
        </form>
      )}
    </NgoShell>
  );
}

export function RequestSubmittedPage() {
  const { requestId = "" } = useParams();
  const { session } = useAuth();
  const location = useLocation();
  const [request, setRequest] = useState<NgoRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase || !session) { setError(supabaseConfigurationError ?? "Sign in to view this request."); return; }
      try {
        const data = await fetchNgoRequest(supabase, session.user.id, requestId);
        if (active && !data) setError("This request is unavailable or not visible to your organization.");
        else if (active) setRequest(data);
      } catch (cause) {
        if (active) setError(messageOf(cause));
      }
    }
    void load();
    return () => { active = false; };
  }, [requestId, session]);
  const stateRequestId = location.state && typeof location.state === "object" && "requestId" in location.state
    ? String(location.state.requestId)
    : requestId;

  return (
    <NgoShell activeLabel="My Requests" title="Pickup Request Submitted!" description="Your request has been sent to the donor.">
      <div className="ngo-success-page">
        <Card className="ngo-success-card" padding="lg">
          <span aria-hidden="true" className="ngo-success-mark"><Check size={28} /></span>
          <h2>Request submitted</h2>
          <p>The donor will review your request. You can follow updates in My Requests.</p>
          {error && <InlineAlert tone="warning">{error}</InlineAlert>}
          {request && <div className="ngo-success-summary">
            <div><span>Request</span><strong>{stateRequestId.slice(0, 8).toUpperCase()}</strong></div>
            <div><span>Quantity</span><strong>{Number(request.requested_quantity).toLocaleString()}</strong></div>
            <div><span>Status</span><RequestStatus request={request} /></div>
          </div>}
          <div className="ngo-form-actions">
            <Link className="ngo-button-link ngo-button-link--outline" to="/ngo">Go to dashboard</Link>
            <Link className="ngo-button-link" to="/ngo/requests">View my requests</Link>
          </div>
        </Card>
      </div>
    </NgoShell>
  );
}

export function NgoRequestsPage() {
  const { data: requests, error, loading, reload } = useNgoRequests();
  const [filter, setFilter] = useState<NgoRequestFilter>("all");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterNgoRequests(requests ?? [], filter).filter((request) => matchesNgoRequest(request, query)), [filter, query, requests]);

  return (
    <NgoShell activeLabel="My Requests" title="My Requests" description="Track requests from submission through donor response and receipt.">
      <div className="ngo-page-stack">
        <label className="ngo-search"><Search aria-hidden="true" size={18} /><input aria-label="Search requests" onChange={(event) => setQuery(event.target.value)} placeholder="Search request or donation reference" value={query} /></label>
        <FilterTabs<NgoRequestFilter>
          label="Request status"
          onChange={setFilter}
          options={[
            { value: "all", text: "All" },
            { value: "pending", text: "Pending" },
            { value: "accepted", text: "Accepted" },
            { value: "declined", text: "Declined" },
            { value: "completed", text: "Received" },
          ]}
          selected={filter}
        />
        {error && <ErrorState description={error} onRetry={() => void reload()} />}
        {loading ? <LoadingState label="Loading your requests" /> : error ? null : filtered.length
          ? <div className="ngo-card-list">{filtered.map((request) => (
            <RequestCard action={<Link className="ngo-button-link ngo-button-link--outline" to={`/ngo/requests/${request.id}`}>View details</Link>} key={request.id} request={request} />
          ))}</div>
          : <EmptyState description={query ? "Try another request or donation reference." : "Pickup requests submitted by your organization will appear here."} title="No matching requests" />}
      </div>
    </NgoShell>
  );
}

export function NgoDeliveriesPage() {
  const location = useLocation();
  const { data: requests, error, loading, reload } = useNgoRequests();
  const [filter, setFilter] = useState<NgoDeliveryFilter>("all");
  const verificationOnly = location.pathname === "/ngo/verification";
  const [verificationFilter, setVerificationFilter] = useState<"pending" | "verified" | "issue_reported" | "all">("pending");
  const deliveries = useMemo(() => {
    const base = filterNgoDeliveries(requests ?? [], filter);
    if (!verificationOnly) return base;
    return base.filter((request) => verificationFilter === "all"
      ? request.delivery_verification_status !== "pending" || isAwaitingNgoVerification(request)
      : verificationFilter === "pending"
        ? isAwaitingNgoVerification(request)
        : request.delivery_verification_status === verificationFilter);
  }, [filter, requests, verificationFilter, verificationOnly]);

  return (
    <NgoShell activeLabel={verificationOnly ? "Delivery Verification" : "My Deliveries"} title={verificationOnly ? "Delivery Verification" : "My Deliveries"} description={verificationOnly ? "Review volunteer deliveries and confirm or report receipt." : "Track donor-approved pickups and confirm food receipt."}>
      <div className="ngo-page-stack">
        {!verificationOnly && <FilterTabs<NgoDeliveryFilter>
          label="Delivery status"
          onChange={setFilter}
          options={[
            { value: "all", text: "All deliveries" },
            { value: "scheduled", text: "Accepted" },
            { value: "in_transit", text: "In transit" },
            { value: "completed", text: "Received" },
          ]}
          selected={filter}
        />}
        {verificationOnly && <FilterTabs
          label="Verification status"
          onChange={setVerificationFilter}
          options={[
            { value: "pending", text: "Awaiting review" },
            { value: "verified", text: "Verified" },
            { value: "issue_reported", text: "Issues" },
            { value: "all", text: "All" },
          ]}
          selected={verificationFilter}
        />}
        <InlineAlert tone="info" title={verificationOnly ? "Receipt review" : "Volunteer assignment"}>{verificationOnly ? "Confirm receipt only after checking the delivered quantity and condition. Report an issue when the delivery needs follow-up." : "Accepted pickups are claimed by volunteers and progress updates appear here as collection and delivery are confirmed."}</InlineAlert>
        {error && <ErrorState description={error} onRetry={() => void reload()} />}
        {loading ? <LoadingState label="Loading accepted pickups" /> : error ? null : deliveries.length
          ? <div className="ngo-card-list">{deliveries.map((request) => (
            <RequestCard action={<Link className="ngo-button-link ngo-button-link--outline" to={`/ngo/deliveries/${request.id}`}>View details</Link>} key={request.id} request={request} />
          ))}</div>
          : <EmptyState description={verificationOnly ? "Volunteer deliveries awaiting your review will appear here." : "Donor-approved pickups will appear here when your organization has an accepted request."} title={verificationOnly ? "No deliveries awaiting review" : "No deliveries yet"} />}
      </div>
    </NgoShell>
  );
}

function requestTimeline(request: NgoRequest, history: NgoRequestHistory[]) {
  const hasStatus = (status: NgoRequest["status"]) => history.some((entry) => entry.status === status);
  const timeline = [
    { label: "Request submitted", detail: dateLabel(request.created_at), state: "complete" as const },
    {
      label: "Donor accepted",
      detail: "Pickup approved by the donor",
      state: hasStatus("confirmed") || ["confirmed", "picked_up", "completed"].includes(request.status) ? "complete" as const : "upcoming" as const,
    },
    {
      label: "Food collected",
      detail: "Donor handover recorded",
      state: hasStatus("picked_up") || ["picked_up", "completed"].includes(request.status) ? "complete" as const : "upcoming" as const,
    },
    {
      label: "Receipt confirmed",
      detail: "Organization confirmed receipt",
      state: hasStatus("completed") || request.status === "completed" ? "complete" as const : "upcoming" as const,
    },
  ];
  return timeline;
}

export function NgoDeliveryDetailsPage() {
  const { requestId = "" } = useParams();
  const location = useLocation();
  const isDelivery = location.pathname.startsWith("/ngo/deliveries/");
  const { session } = useAuth();
  const [state, setState] = useState<LoadState<{ request: NgoRequest; history: NgoRequestHistory[]; handover: NgoHandover | null }>>({
    data: null, error: null, loading: true,
  });
  const [issueReason, setIssueReason] = useState("");
  const [reportingIssue, setReportingIssue] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const canReviewDelivery = Boolean(state.data
    && state.data.request.status === "picked_up"
    && state.data.request.delivery_verification_status === "pending"
    && (state.data.request.volunteer_id === null || state.data.request.volunteer_delivered_at !== null));
  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase || !session) { setState({ data: null, error: supabaseConfigurationError ?? "Sign in to view this delivery.", loading: false }); return; }
      setState({ data: null, error: null, loading: true });
      try {
        const request = await fetchNgoRequest(supabase, session.user.id, requestId);
        if (!request) throw new Error("This delivery is unavailable or does not belong to your organization.");
        const [history, handover] = await Promise.all([
          fetchRequestHistory(supabase, request.id),
          fetchHandover(supabase, request.id),
        ]);
        if (active) setState({ data: { request, history, handover }, error: null, loading: false });
      } catch (cause) {
        if (active) setState({ data: null, error: messageOf(cause), loading: false });
      }
    }
    void load();
    return () => { active = false; };
  }, [requestId, session]);

  async function reportIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !state.data) return;
    const reason = issueReason.trim();
    if (!reason) { setIssueError("Describe the delivery issue before submitting."); return; }
    setReportingIssue(true);
    setIssueError(null);
    try {
      await reportNgoDeliveryIssue(supabase, state.data.request.id, reason);
      setState((current) => current.data ? {
        ...current,
        data: { ...current.data, request: { ...current.data.request, delivery_verification_status: "issue_reported", delivery_issue_reason: reason } },
      } : current);
      setIssueReason("");
    } catch (cause) {
      setIssueError(messageOf(cause));
    } finally {
      setReportingIssue(false);
    }
  }

  return (
    <NgoShell
      activeLabel={isDelivery ? "My Deliveries" : "My Requests"}
      title={isDelivery ? "Delivery Details" : "Request Details"}
      action={<Link className="ngo-button-link ngo-button-link--outline" to={isDelivery ? "/ngo/deliveries" : "/ngo/requests"}><ArrowLeft size={15} /> Back to {isDelivery ? "deliveries" : "requests"}</Link>}
    >
      {state.loading ? <LoadingState label="Loading delivery details" /> : state.error
        ? <ErrorState description={state.error} />
        : state.data && <div className="ngo-detail-grid">
          <Card className="ngo-detail-card" padding="lg">
            <SectionHeading description={`Request ${state.data.request.id.slice(0, 8).toUpperCase()}`} title="Pickup overview" />
            <div className="ngo-detail-fields">
              <div><PackageCheck size={17} /><span><small>Donation reference</small><strong>{state.data.request.donation_id}</strong></span></div>
              <div><CalendarClock size={17} /><span><small>Preferred pickup</small><strong>{dateLabel(state.data.request.pickup_at)}</strong></span></div>
              <div><UsersRound size={17} /><span><small>Volunteer</small><strong>{state.data.request.volunteer_id ? "Assigned volunteer" : "Waiting for a volunteer"}</strong></span></div>
            </div>
            <RequestStatus request={state.data.request} />
            {state.data.handover && <InlineAlert tone="success" title="Donor handover recorded">The donor recorded collection on {dateLabel(state.data.handover.recorded_at)}.</InlineAlert>}
            {state.data.request.volunteer_picked_up_at && <InlineAlert tone="success" title="Food collected">A volunteer confirmed pickup on {dateLabel(state.data.request.volunteer_picked_up_at)}.</InlineAlert>}
            {state.data.request.volunteer_delivered_at && state.data.request.status !== "completed" && <InlineAlert tone="info" title="Delivered to your organization">A volunteer confirmed delivery on {dateLabel(state.data.request.volunteer_delivered_at)}. Confirm receipt to complete this request.</InlineAlert>}
            {state.data.request.delivery_verification_status === "verified" && <InlineAlert tone="success" title="Receipt verified">Your organization verified this delivery on {dateLabel(state.data.request.delivery_verified_at)}.</InlineAlert>}
            {state.data.request.delivery_verification_status === "issue_reported" && <InlineAlert tone="warning" title="Issue reported">{state.data.request.delivery_issue_reason}</InlineAlert>}
            {isDelivery && canReviewDelivery && <div className="ngo-form-actions">
              <Link className="ngo-button-link" to={`/ngo/deliveries/${state.data.request.id}/receipt`}>Confirm food receipt</Link>
            </div>}
            {isDelivery && canReviewDelivery && <form className="ngo-issue-form" onSubmit={(event) => void reportIssue(event)}>
              {issueError && <InlineAlert tone="danger">{issueError}</InlineAlert>}
              <TextareaField label="Report a delivery issue" hint="Explain what needs follow-up. This is required and visible to authorized staff." maxLength={2000} onChange={(event) => setIssueReason(event.target.value)} value={issueReason} />
              <Button loading={reportingIssue} type="submit" variant="outline">Report issue</Button>
            </form>}
            <InlineAlert tone="info">Pickup and drop-off addresses are not displayed here because no NGO-authorized donor location access is available.</InlineAlert>
          </Card>
          <Card padding="lg">
            <SectionHeading title="Delivery progress" />
            <ProgressTimeline steps={requestTimeline(state.data.request, state.data.history)} />
            {state.data.request.notes && <div className="ngo-note"><small>Request notes</small><p>{state.data.request.notes}</p></div>}
          </Card>
        </div>}
    </NgoShell>
  );
}

export function ConfirmNgoReceiptPage() {
  const { requestId = "" } = useParams();
  const { session, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [request, setRequest] = useState<NgoRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase || !session) { setError(supabaseConfigurationError ?? "Sign in to confirm receipt."); setLoading(false); return; }
      try {
        const data = await fetchNgoRequest(supabase, session.user.id, requestId);
        if (!data) throw new Error("This request is unavailable or does not belong to your organization.");
        if (active) { setRequest(data); setQuantity(String(data.requested_quantity)); }
      } catch (cause) {
        if (active) setError(messageOf(cause));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [requestId, session]);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !request) { setError(supabaseConfigurationError ?? "Receipt data is unavailable."); return; }
    const received = Number(quantity);
    const validationError = validateReceiptQuantity(received, request.requested_quantity);
    if (validationError) { setError(validationError); return; }
    if (request.status !== "picked_up" || request.delivery_verification_status !== "pending") { setError("This delivery is no longer awaiting receipt verification."); return; }
    setBusy(true);
    setError(null);
    const { error: receiptError } = await supabase.rpc("confirm_ngo_receipt", {
      p_request_id: request.id,
      p_received_quantity: received,
    });
    setBusy(false);
    if (receiptError) { setError(receiptError.message); return; }
    if (!await refreshProfile()) {
      setError("Receipt was confirmed, but your application profile could not be reloaded. Refresh the page before continuing.");
      return;
    }
    navigate(`/ngo/deliveries/${request.id}/receipt/confirmed`, { replace: true });
  }

  return (
    <NgoShell activeLabel="My Deliveries" title="Confirm Food Receipt" description="Confirm the full quantity recorded at donor handover.">
      {loading ? <LoadingState label="Loading receipt details" /> : error && !request
        ? <ErrorState description={error} />
        : request && <form className="ngo-receipt-layout" onSubmit={(event) => void confirm(event)}>
          <Card className="ngo-form-card" padding="lg">
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <SectionHeading title="Receipt check" />
            {(request.status !== "picked_up" || request.delivery_verification_status !== "pending") && <InlineAlert tone="warning">This delivery is no longer awaiting receipt verification. Current status: {ngoRequestLabel(request.status)}.</InlineAlert>}
            <div className="ngo-detail-fields">
              <div><PackageCheck size={17} /><span><small>Request</small><strong>{request.id.slice(0, 8).toUpperCase()}</strong></span></div>
              <div><CalendarClock size={17} /><span><small>Scheduled pickup</small><strong>{dateLabel(request.pickup_at)}</strong></span></div>
            </div>
            <TextField
              label="Quantity received"
              min={0.001}
              onChange={(event) => setQuantity(event.target.value)}
              required
              step="any"
              type="number"
              value={quantity}
            />
            <InlineAlert tone="info">Partial receipts and quality-evidence uploads are not supported by the current receipt RPC. Confirm only if the full handed-over quantity was received.</InlineAlert>
            <div className="ngo-form-actions">
              <Link className="ngo-button-link ngo-button-link--outline" to={`/ngo/deliveries/${request.id}`}>Back</Link>
              <Button disabled={request.status !== "picked_up" || request.delivery_verification_status !== "pending"} loading={busy} type="submit">Confirm receipt</Button>
            </div>
          </Card>
        </form>}
    </NgoShell>
  );
}

export function ReceiptConfirmedPage() {
  const { requestId = "" } = useParams();
  const { session } = useAuth();
  const [request, setRequest] = useState<NgoRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase || !session) { setError(supabaseConfigurationError ?? "Sign in to view this receipt."); return; }
      try {
        const data = await fetchNgoRequest(supabase, session.user.id, requestId);
        if (active && (!data || data.status !== "completed")) setError("The completed receipt record could not be confirmed.");
        else if (active) setRequest(data);
      } catch (cause) {
        if (active) setError(messageOf(cause));
      }
    }
    void load();
    return () => { active = false; };
  }, [requestId, session]);

  return (
    <NgoShell activeLabel="My Deliveries" title="Receipt Confirmed!" description="Thank you for helping good food reach your community.">
      <div className="ngo-success-page">
        <Card className="ngo-success-card" padding="lg">
          <span aria-hidden="true" className="ngo-success-mark"><Check size={28} /></span>
          <h2>Food receipt confirmed</h2>
          <p>The receipt has been recorded against your organization's request.</p>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          {request && <div className="ngo-success-summary">
            <div><span>Request</span><strong>{request.id.slice(0, 8).toUpperCase()}</strong></div>
            <div><span>Quantity received</span><strong>{request.received_quantity?.toLocaleString() ?? request.requested_quantity.toLocaleString()}</strong></div>
            <div><span>Confirmed</span><strong>{dateLabel(request.receipt_confirmed_at)}</strong></div>
          </div>}
          <div className="ngo-form-actions">
            <Link className="ngo-button-link ngo-button-link--outline" to={`/ngo/deliveries/${requestId}`}>View delivery details</Link>
            <Link className="ngo-button-link" to="/ngo/deliveries">Back to my deliveries</Link>
          </div>
        </Card>
      </div>
    </NgoShell>
  );
}

export function NgoImpactPage() {
  const { data: requests, error, loading, reload } = useNgoRequests();
  const summary = summarizeNgoRequests(requests ?? []);
  const completed = requests?.filter((request) => request.status === "completed") ?? [];
  return (
    <NgoShell activeLabel="Impact" title="Your Impact" description="A clear view of food receipts confirmed by your organization.">
      <div className="ngo-page-stack">
        {error && <ErrorState description={error} onRetry={() => void reload()} />}
        <section aria-label="Confirmed organization impact" className="ngo-stat-grid ngo-impact-stats">
          <StatCard detail="Completed, recipient-confirmed records" icon={<PackageCheck size={19} />} label="Food receipts" value={loading ? "…" : String(summary.completed)} />
          <StatCard detail="Accepted and in-transit pickups" icon={<UsersRound size={19} />} label="Active requests" value={loading ? "…" : String(summary.active)} tone="mint" />
          <StatCard detail="Only confirmed receipts are counted" icon={<Heart size={19} />} label="People served" value="—" tone="amber" />
          <StatCard detail="No approved environmental factor" icon={<ShieldCheck size={19} />} label="Food weight / CO₂" value="—" tone="blue" />
        </section>
        <Card padding="lg">
          <SectionHeading title="Recent confirmed pickups" description="Unverified estimates are intentionally not shown." />
          {loading ? <LoadingState label="Loading confirmed receipts" /> : error ? null : completed.length
            ? <div className="ngo-card-list">{completed.slice(0, 6).map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}</div>
            : <EmptyState description="Completed receipts will be reflected here after your organization confirms delivery." title="No confirmed receipts yet" />}
        </Card>
        <InlineAlert tone="info">The current backend does not expose a recipient impact view, serving counts, food categories, or approved weight/emissions factors. Metrics above are limited to request records and remain unestimated.</InlineAlert>
      </div>
    </NgoShell>
  );
}

export function NgoProfilePage() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<NgoProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [openingDocument, setOpeningDocument] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase || !session) { setError(supabaseConfigurationError ?? "Sign in to view your organization profile."); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNgoProfile(supabase, session.user.id);
      if (!data) throw new Error("Your organization profile could not be found.");
      setProfile(data);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, [session]);
  useEffect(() => { void reload(); }, [reload]);

  async function openDocument(path: string) {
    if (!supabase) { setError(supabaseConfigurationError); return; }
    setOpeningDocument(true);
    setError(null);
    try {
      setDocumentUrl(await createNgoDocumentUrl(supabase, path));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setOpeningDocument(false);
    }
  }

  const documents = profile ? [
    { label: "Registration certificate", path: profile.registration_certificate_path },
    { label: "Organization proof", path: profile.ngo_proof_path },
  ] : [];
  return (
    <NgoShell activeLabel="Profile" title="Organization Profile" description="Review your organization details and any optional legacy files.">
      <div className="ngo-page-stack">
        {error && <ErrorState description={error} onRetry={() => void reload()} />}
        {loading ? <LoadingState label="Loading organization profile" /> : profile && <>
          <div className="ngo-profile-tabs" role="tablist" aria-label="Organization profile sections">
            <a aria-current="page" href="#organization-details">Organization Details</a>
            <a href="#organization-documents">Saved Documents</a>
          </div>
          <div id="organization-details"><Card padding="lg">
            <SectionHeading action={<Link className="ngo-button-link ngo-button-link--outline" to="/onboarding/ngo/organization">Edit profile</Link>} title="Organization Details" />
            <div className="ngo-profile-grid">
              <ProfileValue label="Organization name" value={profile.organization_name} />
              <ProfileValue label="Organization type" value={profile.organization_type} />
              <ProfileValue label="Registration number" value={profile.registration_number} />
              <ProfileValue label="Organization address" value={profile.organization_address} />
              <ProfileValue label="Description" value={profile.description} />
              <ProfileValue label="Contact person" value={profile.contact_name} />
              <ProfileValue label="Designation" value={profile.contact_designation} />
              <ProfileValue label="Contact email" value={profile.contact_email} />
              <ProfileValue label="Contact phone" value={profile.contact_phone} />
            </div>
          </Card></div>
          <div id="organization-documents"><Card padding="lg">
            <SectionHeading title="Previously Uploaded Documents" description="Optional legacy files remain private and can be opened with a short-lived signed URL." />
            {documents.map((document) => (
              <div className="ngo-document-row" key={document.label}>
                <FileCheck2 aria-hidden="true" size={19} />
                <span><strong>{document.label}</strong><small>{document.path ? "Private document uploaded" : "No document uploaded"}</small></span>
                {document.path && <Button disabled={openingDocument} onClick={() => void openDocument(document.path ?? "")} size="sm" variant="outline">Open securely</Button>}
              </div>
            ))}
            {documentUrl && <a className="ngo-document-link" href={documentUrl} rel="noreferrer" target="_blank">Open private legacy document</a>}
          </Card></div>
        </>}
      </div>
    </NgoShell>
  );
}

function ProfileValue({ label, value }: { label: string; value: string | null }) {
  return <div className="ngo-profile-value"><small>{label}</small><strong>{value?.trim() || "Not provided"}</strong></div>;
}

export function NgoSettingsPage() {
  return (
    <NgoShell activeLabel="Settings" title="Settings" description="Account and privacy information for your organization.">
      <div className="ngo-settings-grid">
        <Card padding="lg">
          <SectionHeading title="Notification Preferences" />
          <EmptyState description="Request, pickup, message, and delivery notification preferences cannot be saved because the current backend has no NGO notification settings or delivery channel." title="Preferences unavailable" />
        </Card>
        <Card padding="lg">
          <SectionHeading title="Security" />
          <p className="ngo-settings-copy">Your account is protected by Supabase authentication. Use the secure password reset flow to change your password.</p>
          <Link className="ngo-button-link ngo-button-link--outline" to="/reset-password">Reset password</Link>
        </Card>
        <Card padding="lg">
          <SectionHeading title="Privacy" />
          <p className="ngo-settings-copy">Any previously uploaded organization files remain private and are opened only through short-lived signed links.</p>
        </Card>
        <Card padding="lg">
          <SectionHeading title="Account Management" />
          <p className="ngo-settings-copy">Organization deactivation and account deletion are not available in the current backend. Contact the ResQPlate team for account changes.</p>
          <Link className="ngo-button-link ngo-button-link--outline" to="/logout">Sign out</Link>
        </Card>
      </div>
    </NgoShell>
  );
}

export function NgoUnavailableFeaturePage({ feature }: { feature: "Messages" | "Notifications" }) {
  const activeLabel = feature;
  const message = feature === "Messages"
    ? "There is no conversation or message schema, participant policy, or message service in the current backend."
    : "There is no notification table or delivery service in the current backend.";
  return (
    <NgoShell activeLabel={activeLabel} title={feature} description={feature === "Messages" ? "Coordinate food pickups with approved participants." : "Updates about requests and deliveries."}>
      <Card padding="lg">
        <EmptyState description={message} icon={<ShieldCheck size={22} />} title={`${feature} unavailable`} />
      </Card>
    </NgoShell>
  );
}
