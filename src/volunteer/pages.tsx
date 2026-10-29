import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  MapPin,
  LocateFixed,
  PackageCheck,
  RefreshCw,
  Truck,
  Utensils,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { AppShell, PageHeader } from "../components/layout";
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
  TextareaField,
  TextField,
} from "../components/ui";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  claimVolunteerTask,
  coordinatesAreValid,
  coordinatePair,
  confirmVolunteerPickup,
  fetchVolunteerTasks,
  distanceInKilometers,
  isAssignedVolunteerTask,
  taskStatusLabel,
  taskDeliveryLabel,
  volunteerNavigationStage,
  type VolunteerTask,
} from "./data";

type LoadState<T> =
  | { data: T; error: null; loading: false }
  | { data: null; error: string; loading: false }
  | { data: null; error: null; loading: true };

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

async function messageOfEdgeError(error: unknown) {
  if (typeof error === "object" && error !== null && "context" in error && error.context instanceof Response) {
    const response = error.context;
    try {
      const body: unknown = await response.clone().json();
      if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
        return body.error;
      }
    } catch {
      if (response.status) {
        return `Delivery verification service returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`;
      }
    }
  }
  const message = messageOf(error);
  if (message.toLowerCase().includes("failed to send a request to the edge function")) {
    return "Could not reach the delivery verification service. Check the function deployment, allowed browser origin, and network connection, then try again.";
  }
  return message;
}

function dateLabel(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Invalid date"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function quantityLabel(task: VolunteerTask) {
  return `${Number(task.quantity).toLocaleString()} ${task.unit}`;
}

function VolunteerShell({
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
  return (
    <AppShell
      activeLabel={activeLabel}
      role="volunteer"
      userName={profile?.full_name ?? session?.user.email ?? "Volunteer"}
    >
      <PageHeader action={action} description={description} title={title} />
      {children}
    </AppShell>
  );
}

function useVolunteerTasks() {
  const [state, setState] = useState<LoadState<VolunteerTask[]>>({ data: null, error: null, loading: true });

  const reload = useCallback(async () => {
    if (!supabase) {
      setState({ data: null, error: supabaseConfigurationError ?? "Supabase is not configured.", loading: false });
      return null;
    }
    setState({ data: null, error: null, loading: true });
    try {
      const tasks = await fetchVolunteerTasks(supabase);
      setState({ data: tasks, error: null, loading: false });
      return tasks;
    } catch (error) {
      setState({ data: null, error: messageOf(error), loading: false });
      return null;
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  return { ...state, reload };
}

function taskTone(status: VolunteerTask["status"]) {
  if (status === "completed") return "success" as const;
  if (status === "confirmed" || status === "picked_up") return "warning" as const;
  if (status === "declined" || status === "cancelled") return "danger" as const;
  return "info" as const;
}

type VolunteerTaskFilter = "assigned" | "pickup_pending" | "picked_up" | "in_transit" | "drop_otp_pending" | "completed" | "issues";

function matchesTaskFilter(task: VolunteerTask, filter: VolunteerTaskFilter) {
  if (filter === "assigned" || filter === "pickup_pending") return task.status === "confirmed";
  if (filter === "picked_up" || filter === "in_transit" || filter === "drop_otp_pending") return task.status === "picked_up";
  if (filter === "completed") return task.status === "completed";
  return false;
}

function TaskCard({ task, action }: { task: VolunteerTask; action?: ReactNode }) {
  const assigned = isAssignedVolunteerTask(task);
  return (
    <article className="volunteer-task-card">
      <div className="volunteer-task-icon"><PackageCheck aria-hidden="true" size={20} /></div>
      <div className="volunteer-task-main">
        <div className="volunteer-task-heading">
          <h2>{task.food_name}</h2>
          <StatusBadge tone={assigned ? taskTone(task.status) : "info"}>
            {assigned ? taskStatusLabel(task.status) : "Available"}
          </StatusBadge>
        </div>
        <p>{quantityLabel(task)} · {task.description}</p>
        <div className="volunteer-task-meta">
          <span><CalendarClock aria-hidden="true" size={14} /> Pickup {dateLabel(task.pickup_at)}</span>
          <span><Clock3 aria-hidden="true" size={14} /> Expires {dateLabel(task.expires_at)}</span>
          <span><Truck aria-hidden="true" size={14} /> {assigned ? "Your delivery task" : "Pickup details after acceptance"}</span>
        </div>
        {assigned && <div className="volunteer-task-route">
          <span><MapPin aria-hidden="true" size={14} /> {task.pickup_address}</span>
          <ArrowRight aria-hidden="true" size={14} />
          <span><MapPin aria-hidden="true" size={14} /> {task.ngo_address}</span>
        </div>}
      </div>
      <div className="volunteer-task-actions">{action}</div>
    </article>
  );
}

function taskProgress(task: VolunteerTask) {
  const assigned = isAssignedVolunteerTask(task);
  const pickedUp = task.volunteer_picked_up_at !== null;
  const delivered = task.volunteer_delivered_at !== null;
  const completed = task.status === "completed";
  return [
    { label: "Task accepted", detail: assigned ? "Assigned to you" : "Claim this task to begin", state: assigned ? "complete" as const : "current" as const },
    { label: "Food collected", detail: task.volunteer_picked_up_at ? dateLabel(task.volunteer_picked_up_at) : undefined, state: pickedUp ? "complete" as const : assigned ? "current" as const : "upcoming" as const },
    { label: "Delivered to organization", detail: task.volunteer_delivered_at ? dateLabel(task.volunteer_delivered_at) : undefined, state: delivered ? "complete" as const : pickedUp ? "current" as const : "upcoming" as const },
    { label: "Receipt confirmed", detail: completed ? "Confirmed by the organization" : "The NGO confirms receipt", state: completed ? "complete" as const : "upcoming" as const },
  ];
}

function directionsUrl(address: string | null) {
  return address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
    : null;
}

function mapDirectionsUrl(
  destinationAddress: string | null,
  destinationLatitude: number | null,
  destinationLongitude: number | null,
  origin: { latitude: number; longitude: number } | null,
) {
  const destination = coordinatesAreValid(destinationLatitude, destinationLongitude)
    ? `${destinationLatitude},${destinationLongitude}`
    : destinationAddress;
  if (!destination) return null;
  const originQuery = origin ? `&origin=${origin.latitude},${origin.longitude}` : "";
  return `https://www.google.com/maps/dir/?api=1${originQuery}&destination=${encodeURIComponent(destination)}`;
}

function VolunteerMapViewport({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (points.length > 1) {
      map.fitBounds(points, { padding: [28, 28], maxZoom: 15 });
    } else if (points.length === 1) {
      map.setView(points[0], 14);
    }
  }, [map, points]);
  return null;
}

function VolunteerRouteMap({
  destination,
  current,
}: {
  destination: { latitude: number | null; longitude: number | null };
  current: { latitude: number; longitude: number } | null;
}) {
  const destinationPoint = coordinatePair(destination.latitude, destination.longitude);
  const points: LatLngTuple[] = [];
  if (destinationPoint) points.push([destinationPoint.latitude, destinationPoint.longitude]);
  if (current) points.push([current.latitude, current.longitude]);
  if (points.length === 0) return null;
  return (
    <div aria-label="Active delivery destination map" className="volunteer-route-map">
      <MapContainer center={points[0]} className="volunteer-route-map-canvas" scrollWheelZoom={false} zoom={12}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <VolunteerMapViewport points={points} />
        {destinationPoint && <Marker position={[destinationPoint.latitude, destinationPoint.longitude]} />}
        {current && <Marker position={[current.latitude, current.longitude]} />}
      </MapContainer>
    </div>
  );
}

export function VolunteerDashboardPage() {
  const { data, error, loading, reload } = useVolunteerTasks();
  const assigned = data?.filter(isAssignedVolunteerTask) ?? [];
  const availableCount = data?.filter((task) => !isAssignedVolunteerTask(task)).length ?? 0;
  const active = assigned.filter((task) => task.status !== "completed");
  const completed = assigned.filter((task) => task.status === "completed");
  const nextTask = active.find((task) => task.status === "confirmed") ?? active[0];

  return (
    <VolunteerShell
      activeLabel="Dashboard"
      description="Coordinate safe pickups and deliveries for your community."
      title="Volunteer Dashboard"
      action={<Button icon={<RefreshCw size={15} />} onClick={() => void reload()} variant="outline">Refresh</Button>}
    >
      {error && <ErrorState description={error} onRetry={() => void reload()} />}
      <section aria-label="Volunteer activity" className="volunteer-stat-grid">
        <StatCard detail="Tasks assigned to you" icon={<Truck size={19} />} label="Active tasks" value={loading ? "…" : String(active.length)} />
        <StatCard detail="Confirmed by donors, ready to claim" icon={<PackageCheck size={19} />} label="Available tasks" tone="mint" value={loading ? "…" : String(availableCount)} />
        <StatCard detail="Completed after NGO receipt" icon={<Check size={19} />} label="Delivered" tone="amber" value={loading ? "…" : String(completed.length)} />
      </section>
      <div className="volunteer-dashboard-grid">
        <Card padding="lg">
          <SectionHeading
            action={<Link className="volunteer-text-link" to="/volunteer/tasks">View my tasks <ArrowRight size={15} /></Link>}
            description="Assignments and pickup-to-delivery progress."
            title="Ongoing tasks"
          />
          {loading ? <LoadingState label="Loading your volunteer tasks" /> : error ? null : active.length
            ? <div className="volunteer-task-list">{active.slice(0, 3).map((task) => (
              <TaskCard
                action={<Link className="volunteer-outline-link" to={`/volunteer/tasks/${task.request_id}`}>View details <ArrowRight size={15} /></Link>}
                key={task.request_id}
                task={task}
              />
            ))}</div>
            : <EmptyState description="Claim an eligible, donor-approved task to see its pickup and delivery steps here." title="No active tasks" />}
        </Card>
        <Card className="volunteer-next-task" padding="lg">
          <span className="volunteer-feature-icon"><Truck aria-hidden="true" size={22} /></span>
          <SectionHeading title="Deliver food, spread hope" />
          {nextTask
            ? <>
              <p>{nextTask.food_name} · {quantityLabel(nextTask)}</p>
              <div className="volunteer-next-task-time"><CalendarClock size={16} />{dateLabel(nextTask.pickup_at)}</div>
              <Link className="volunteer-primary-link" to={`/volunteer/tasks/${nextTask.request_id}`}>Continue task <ArrowRight size={16} /></Link>
            </>
            : <><p>Browse confirmed pickups and choose a delivery task that works for you.</p><Link className="volunteer-primary-link" to="/volunteer/tasks/available">Find available tasks <ArrowRight size={16} /></Link></>}
        </Card>
      </div>
    </VolunteerShell>
  );
}

export function VolunteerAvailableTasksPage() {
  const { data, error, loading, reload } = useVolunteerTasks();
  const [search, setSearch] = useState("");
  const tasks = useMemo(() => (data ?? [])
    .filter((task) => !isAssignedVolunteerTask(task))
    .filter((task) => `${task.food_name} ${task.description}`.toLowerCase().includes(search.trim().toLowerCase())), [data, search]);

  return (
    <VolunteerShell
      activeLabel="Available Tasks"
      description="Choose a confirmed pickup to deliver food to a local organization."
      title="Available Delivery Tasks"
      action={<Button icon={<RefreshCw size={15} />} onClick={() => void reload()} variant="outline">Refresh</Button>}
    >
      <div className="volunteer-toolbar">
        <TextField label="Search tasks" onChange={(event) => setSearch(event.target.value)} placeholder="Search food or details" value={search} />
        <InlineAlert tone="info">Pickup and recipient contact details are shown only after a task is assigned to you.</InlineAlert>
      </div>
      {error && <ErrorState description={error} onRetry={() => void reload()} />}
      {loading ? <LoadingState label="Loading available tasks" /> : error ? null : tasks.length
        ? <div className="volunteer-task-list">{tasks.map((task) => (
          <TaskCard
            action={<Link className="volunteer-outline-link" to={`/volunteer/tasks/${task.request_id}`}>View details <ArrowRight size={15} /></Link>}
            key={task.request_id}
            task={task}
          />
        ))}</div>
        : <Card padding="sm"><EmptyState
          action={<Button icon={<RefreshCw size={15} />} onClick={() => void reload()} variant="outline">Refresh tasks</Button>}
          description={search ? "Try a different search term or refresh the task list." : "New tasks appear after an NGO request is confirmed by its donor."}
          title={search ? "No matching tasks" : "No available tasks"}
        /></Card>}
    </VolunteerShell>
  );
}

export function VolunteerMyTasksPage() {
  const { data, error, loading, reload } = useVolunteerTasks();
  const [filter, setFilter] = useState<VolunteerTaskFilter>("assigned");
  const tasks = (data ?? [])
    .filter(isAssignedVolunteerTask)
    .filter((task) => matchesTaskFilter(task, filter));

  return (
    <VolunteerShell
      activeLabel="My Tasks"
      description="Track your accepted tasks from pickup through NGO receipt."
      title="My Tasks"
      action={<Button icon={<RefreshCw size={15} />} onClick={() => void reload()} variant="outline">Refresh</Button>}
    >
      <div aria-label="Filter tasks" className="volunteer-filter-tabs" role="tablist">
        {([
          ["assigned", "Assigned"],
          ["pickup_pending", "Pickup pending"],
          ["picked_up", "Picked up"],
          ["in_transit", "In transit"],
          ["drop_otp_pending", "Drop OTP pending"],
          ["completed", "Completed"],
          ["issues", "Issues"],
        ] as const).map(([value, label]) => (
          <button aria-selected={filter === value} key={value} onClick={() => setFilter(value)} role="tab" type="button">{label}</button>
        ))}
      </div>
      {error && <ErrorState description={error} onRetry={() => void reload()} />}
      {loading ? <LoadingState label="Loading your tasks" /> : error ? null : tasks.length
        ? <div className="volunteer-task-list">{tasks.map((task) => (
          <TaskCard
            action={<Link className="volunteer-outline-link" to={`/volunteer/tasks/${task.request_id}`}>View details <ArrowRight size={15} /></Link>}
            key={task.request_id}
            task={task}
          />
        ))}</div>
        : <Card padding="sm"><EmptyState
          action={filter === "assigned" && <Link className="volunteer-primary-link" to="/volunteer/tasks/available">Browse available tasks <ArrowRight size={16} /></Link>}
          description={filter === "drop_otp_pending" || filter === "issues"
            ? "This stage is not available until delivery verification is added to the backend."
            : "Tasks will appear here as they enter this stage."}
          title={filter === "completed" ? "No completed tasks" : "No matching tasks"}
        /></Card>}
    </VolunteerShell>
  );
}

export function VolunteerTaskDetailsPage() {
  const { requestId = "" } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useVolunteerTasks();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const task = data?.find((item) => item.request_id === requestId) ?? null;
  const assigned = task ? isAssignedVolunteerTask(task) : false;
  const stage = task ? volunteerNavigationStage(task) : "before_acceptance";
  const targetIsDropoff = stage === "dropoff";
  const routeAddress = targetIsDropoff ? task?.dropoff_address ?? task?.ngo_address ?? null : task?.pickup_address ?? null;
  const routeLatitude = targetIsDropoff ? task?.dropoff_latitude ?? null : task?.pickup_latitude ?? null;
  const routeLongitude = targetIsDropoff ? task?.dropoff_longitude ?? null : task?.pickup_longitude ?? null;
  const routePoint = coordinatePair(routeLatitude, routeLongitude);

  function locateVolunteer() {
    if (!navigator.geolocation) {
      setActionError("This browser does not support location access. Use the destination address instead.");
      return;
    }
    setLocating(true);
    setActionError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setActionError("Your current location could not be read. Allow location access or use the destination address instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function perform(action: "claim" | "pickup") {
    if (!supabase || !task || busy) return;
    setBusy(true);
    setActionError(null);
    setSuccess(null);
    try {
      if (action === "claim") {
        await claimVolunteerTask(supabase, task.request_id);
        setSuccess("Task accepted. Pickup and recipient details are now available to you.");
      } else if (action === "pickup") {
        await confirmVolunteerPickup(supabase, task.request_id, note.trim() || null);
        setSuccess("Pickup recorded. You can now deliver the food to the receiving organization.");
        setNote("");
      }
      await reload();
    } catch (cause) {
      setActionError(messageOf(cause));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function sendDeliveryOtp() {
    if (!supabase || !task || otpBusy) return;
    setOtpBusy(true);
    setActionError(null);
    setSuccess(null);
    try {
      const { data: result, error: functionError } = await supabase.functions.invoke("delivery-otp", {
        body: { action: "send", request_id: task.request_id },
      });
      if (functionError) throw functionError;
      if (!result || result.ok !== true) throw new Error("The delivery verification code could not be sent.");
      setOtpSent(true);
      setOtpCode("");
      setSuccess("A verification code was sent to the NGO's verified owner mobile.");
    } catch (cause) {
      setActionError(await messageOfEdgeError(cause));
    } finally {
      setOtpBusy(false);
    }
  }

  async function verifyDeliveryOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !task || otpBusy) return;
    setOtpBusy(true);
    setActionError(null);
    setSuccess(null);
    try {
      const { data: result, error: functionError } = await supabase.functions.invoke("delivery-otp", {
        body: { action: "verify", request_id: task.request_id, otp: otpCode },
      });
      if (functionError) throw functionError;
      if (!result || result.ok !== true) throw new Error("Delivery verification was not confirmed.");
      setOtpCode("");
      setOtpSent(false);
      setSuccess("NGO delivery verified. The organization will confirm final receipt.");
      await reload();
    } catch (cause) {
      setActionError(await messageOfEdgeError(cause));
    } finally {
      setOtpBusy(false);
    }
  }

  const action = !task ? null
    : stage === "before_acceptance"
      ? <Button icon={<Check size={16} />} loading={busy} onClick={() => void perform("claim")}>Accept Task</Button>
      : stage === "pickup"
        ? <Button icon={<Check size={16} />} loading={busy} onClick={() => void perform("pickup")}>Mark Food Collected</Button>
        : stage === "dropoff"
          ? !otpSent && <Button icon={<Check size={16} />} loading={otpBusy} onClick={() => void sendDeliveryOtp()}>Reached NGO / Start Delivery Verification</Button>
          : null;

  return (
  <VolunteerShell
      activeLabel={assigned ? "My Tasks" : "Available Tasks"}
      action={<Button icon={<ArrowLeft size={16} />} onClick={() => navigate(assigned ? "/volunteer/tasks" : "/volunteer/tasks/available")} variant="outline">Back to tasks</Button>}
      description="Task details and delivery progress."
      title={task ? task.food_name : "Delivery Task Details"}
    >
      {loading ? <LoadingState label="Loading delivery task" /> : error
        ? <ErrorState description={error} onRetry={() => void reload()} />
        : !task
          ? <ErrorState description="This task is no longer available or is not assigned to your volunteer account." />
          : <div className="volunteer-detail-layout">
            {actionError && <div className="volunteer-detail-notice"><ErrorState description={actionError} onRetry={() => void reload()} /></div>}
            {success && <div className="volunteer-detail-notice"><InlineAlert tone="success">{success}</InlineAlert></div>}
            <main className="volunteer-detail-main">
              <Card className="volunteer-detail-card" padding="lg">
                <div className="volunteer-detail-heading">
                  <div>
                    <span className="volunteer-task-reference">TASK-{task.request_id.slice(0, 8).toUpperCase()}</span>
                    <h2>{task.food_name}</h2>
                    <p>{quantityLabel(task)} · {task.description}</p>
                  </div>
                  <StatusBadge tone={taskTone(task.status)}>{taskDeliveryLabel(task)}</StatusBadge>
                </div>
                <div className="volunteer-detail-facts">
                  <div><CalendarClock size={17} /><span><small>Pickup schedule</small><strong>{dateLabel(task.pickup_at)}</strong></span></div>
                  <div><Clock3 size={17} /><span><small>Food expiry</small><strong>{dateLabel(task.expires_at)}</strong></span></div>
                  <div><Utensils size={17} /><span><small>Food handling</small><strong>{stage === "pickup" ? task.pickup_instructions ?? "Follow safe food-handling practices during transport." : "Follow safe food-handling practices during transport."}</strong></span></div>
                </div>
              </Card>
              <section className="volunteer-location-section">
                {stage === "before_acceptance" && (
                  <>
                    <SectionHeading description="Review both saved locations and estimated distance before accepting. Navigation and contact details remain hidden until assignment." title="Task locations" />
                    <div className="volunteer-location-grid">
                      <article className="volunteer-location-card volunteer-location-card--pickup">
                        <h3>Donor pickup</h3>
                        <p className="volunteer-location-address">{task.pickup_address ?? "Address unavailable for this task."}</p>
                      </article>
                      <article className="volunteer-location-card volunteer-location-card--dropoff">
                        <h3>NGO drop-off</h3>
                        <p className="volunteer-location-address">{task.dropoff_address ?? task.ngo_address ?? "Address unavailable for this task."}</p>
                      </article>
                    </div>
                    <div className="volunteer-route-summary">
                      {(() => {
                        const pickupPoint = coordinatePair(task.pickup_latitude, task.pickup_longitude);
                        const dropoffPoint = coordinatePair(task.dropoff_latitude, task.dropoff_longitude);
                        return pickupPoint && dropoffPoint
                          ? <span>Estimated distance: {distanceInKilometers(pickupPoint.latitude, pickupPoint.longitude, dropoffPoint.latitude, dropoffPoint.longitude).toFixed(1)} km</span>
                          : <span>Estimated distance unavailable because saved coordinates are missing.</span>;
                      })()}
                    </div>
                  </>
                )}
                {stage === "pickup" && (
                  <>
                    <SectionHeading description="Navigate only to the donor pickup location. The map and directions switch to the NGO after collection is recorded." title="Donor pickup" />
                    <p className="volunteer-location-address">{task.pickup_address ?? "Address unavailable for this task."}</p>
                    {routePoint
                      ? <VolunteerRouteMap current={currentLocation} destination={routePoint} />
                      : <InlineAlert tone="warning">Pickup coordinates are unavailable, so the map cannot be shown. Use the saved address for directions.</InlineAlert>}
                    <div className="volunteer-route-summary">
                      <Button icon={<LocateFixed size={15} />} loading={locating} onClick={locateVolunteer} variant="outline">Use my location for directions</Button>
                      {currentLocation
                        ? (() => {
                          const url = mapDirectionsUrl(routeAddress, routeLatitude, routeLongitude, currentLocation);
                          return url && <a className="volunteer-directions-link" href={url} rel="noreferrer" target="_blank">Directions to pickup <ArrowRight size={14} /></a>;
                        })()
                        : routeAddress && <a className="volunteer-directions-link" href={directionsUrl(routeAddress) ?? undefined} rel="noreferrer" target="_blank">Open pickup directions <ArrowRight size={14} /></a>}
                    </div>
                  </>
                )}
                {stage === "dropoff" && (
                  <>
                    <SectionHeading description="Food collection was recorded. Navigate only to the NGO drop-off location." title="NGO drop-off" />
                    <p className="volunteer-location-address">{task.dropoff_address ?? task.ngo_address ?? "Address unavailable for this task."}</p>
                    {routePoint
                      ? <VolunteerRouteMap current={currentLocation} destination={routePoint} />
                      : <InlineAlert tone="warning">NGO coordinates are unavailable, so the map cannot be shown. Use the saved address for directions.</InlineAlert>}
                    <div className="volunteer-route-summary">
                      <Button icon={<LocateFixed size={15} />} loading={locating} onClick={locateVolunteer} variant="outline">Use my location for directions</Button>
                      {currentLocation
                        ? (() => {
                          const url = mapDirectionsUrl(routeAddress, routeLatitude, routeLongitude, currentLocation);
                          return url && <a className="volunteer-directions-link" href={url} rel="noreferrer" target="_blank">Directions to NGO <ArrowRight size={14} /></a>;
                        })()
                        : routeAddress && <a className="volunteer-directions-link" href={directionsUrl(routeAddress) ?? undefined} rel="noreferrer" target="_blank">Open NGO directions <ArrowRight size={14} /></a>}
                    </div>
                    {otpSent && (
                      <form className="volunteer-otp-form" onSubmit={(event) => void verifyDeliveryOtp(event)}>
                        <label htmlFor="delivery-otp">NGO delivery verification code</label>
                        <input
                          autoComplete="one-time-code"
                          id="delivery-otp"
                          inputMode="numeric"
                          maxLength={6}
                          onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                          pattern="[0-9]{6}"
                          required
                          value={otpCode}
                        />
                        <Button disabled={otpCode.length !== 6} loading={otpBusy} type="submit">Verify delivery code</Button>
                        <Button disabled={otpBusy} loading={otpBusy} onClick={() => void sendDeliveryOtp()} type="button" variant="outline">Resend code</Button>
                      </form>
                    )}
                  </>
                )}
                {stage === "awaiting_receipt" && (
                  <>
                    <SectionHeading description="The NGO verified delivery. Final receipt confirmation remains with the organization." title="Delivery verified" />
                    <InlineAlert tone="success">Delivery verification is complete; awaiting NGO receipt confirmation.</InlineAlert>
                  </>
                )}
              </section>
              <Card className="volunteer-action-card" padding="lg">
                <SectionHeading description={assigned ? "Actions are enabled only for the current backend status." : "Accepting assigns this task to you atomically."} title="Verification and actions" />
                {assigned && task.status === "confirmed" && <TextareaField hint="Optional note recorded with the pickup handover." label="Pickup note" maxLength={1000} onChange={(event) => setNote(event.target.value)} value={note} />}
                {stage === "pickup" && <InlineAlert tone="info">After collection is recorded, navigation switches to the NGO drop-off and delivery verification becomes available.</InlineAlert>}
                {stage === "dropoff" && !otpSent && <InlineAlert tone="info">At the NGO, request a one-time code sent to the verified owner mobile. Delivery is not recorded until the server verifies it.</InlineAlert>}
                {task.volunteer_delivered_at && task.status !== "completed" && <InlineAlert tone="success" title="Awaiting NGO confirmation">Delivery recorded on {dateLabel(task.volunteer_delivered_at)}. The NGO still needs to confirm receipt.</InlineAlert>}
                {task.status === "completed" && <InlineAlert tone="success" title="Verified">The organization confirmed receipt.</InlineAlert>}
                {action && <div className="volunteer-detail-action">{action}</div>}
              </Card>
            </main>
            <aside className="volunteer-detail-sidebar">
              <Card className="volunteer-progress-card" padding="lg">
                <div className="volunteer-sidebar-heading"><span className="volunteer-feature-icon"><Truck aria-hidden="true" size={22} /></span><StatusBadge tone={taskTone(task.status)}>{taskDeliveryLabel(task)}</StatusBadge></div>
                <SectionHeading description="Based on the persisted pickup, delivery, and receipt timestamps." title="Delivery progress" />
                <ProgressTimeline steps={taskProgress(task)} />
              </Card>
              <Card className="volunteer-task-aside" padding="lg">
                <SectionHeading title={assigned ? "Your delivery" : "Accept this task"} />
                <p>{assigned ? "Private pickup and recipient details are shown because this task is assigned to you." : "Another volunteer cannot claim this task at the same time after you accept it."}</p>
                <Link className="volunteer-text-link" to="/volunteer/tasks">View my tasks <ArrowRight size={15} /></Link>
              </Card>
            </aside>
          </div>}
    </VolunteerShell>
  );
}

export function VolunteerUnavailablePage({ feature }: { feature: string }) {
  return (
    <VolunteerShell activeLabel={feature} title={feature} description="This volunteer workspace area is not included in the pickup and delivery workflow.">
      <Card padding="lg">
        <EmptyState
          action={<Link className="volunteer-primary-link" to="/volunteer/tasks/available">Browse available tasks <ArrowRight size={16} /></Link>}
          description={`${feature} is not available in this implementation. Task acceptance, pickup, delivery, and receipt tracking are available.`}
          title={`${feature} is not available yet`}
        />
      </Card>
    </VolunteerShell>
  );
}
