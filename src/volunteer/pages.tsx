import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  MapPin,
  PackageCheck,
  Phone,
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
import {
  claimVolunteerTask,
  confirmVolunteerDelivery,
  confirmVolunteerPickup,
  fetchVolunteerTasks,
  isAssignedVolunteerTask,
  taskStatusLabel,
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

function TaskLocation({
  icon,
  label,
  value,
  contact,
  phone,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  contact?: string | null;
  phone?: string | null;
}) {
  return (
    <div className="volunteer-location">
      <span className="volunteer-location-icon">{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value ?? "Details are available after accepting the task."}</strong>
        {contact && <span>{contact}</span>}
        {phone && <a href={`tel:${phone}`}><Phone aria-hidden="true" size={14} />{phone}</a>}
      </div>
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
  const [filter, setFilter] = useState<"active" | "ready" | "out_for_delivery" | "completed">("active");
  const tasks = (data ?? [])
    .filter(isAssignedVolunteerTask)
    .filter((task) => {
      if (filter === "completed") return task.status === "completed";
      if (filter === "ready") return task.status === "confirmed";
      if (filter === "out_for_delivery") return task.status === "picked_up";
      return task.status !== "completed";
    });

  return (
    <VolunteerShell
      activeLabel="My Tasks"
      description="Track your accepted tasks from pickup through NGO receipt."
      title="My Tasks"
      action={<Button icon={<RefreshCw size={15} />} onClick={() => void reload()} variant="outline">Refresh</Button>}
    >
      <div aria-label="Filter tasks" className="volunteer-filter-tabs" role="tablist">
        {([
          ["active", "All active"],
          ["ready", "Ready to collect"],
          ["out_for_delivery", "Out for delivery"],
          ["completed", "Delivered"],
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
          action={filter === "active" && <Link className="volunteer-primary-link" to="/volunteer/tasks/available">Browse available tasks <ArrowRight size={16} /></Link>}
          description={filter === "completed" ? "Delivered tasks remain available here for reference." : "Tasks will appear here as they enter this stage."}
          title={filter === "completed" ? "No delivered tasks" : "No matching tasks"}
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
  const task = data?.find((item) => item.request_id === requestId) ?? null;
  const assigned = task ? isAssignedVolunteerTask(task) : false;

  async function perform(action: "claim" | "pickup" | "delivery") {
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
      } else {
        await confirmVolunteerDelivery(supabase, task.request_id);
        setSuccess("Delivery recorded. The receiving organization will confirm final receipt.");
      }
      await reload();
    } catch (cause) {
      setActionError(messageOf(cause));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const action = !task ? null : !assigned
    ? <Button icon={<Check size={16} />} loading={busy} onClick={() => void perform("claim")}>Start task</Button>
    : task.status === "confirmed"
      ? <Button icon={<Check size={16} />} loading={busy} onClick={() => void perform("pickup")}>Mark picked up</Button>
      : task.status === "picked_up" && !task.volunteer_delivered_at
        ? <Button icon={<Check size={16} />} loading={busy} onClick={() => void perform("delivery")}>Mark delivered</Button>
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
          : <div className="volunteer-detail-grid">
            {actionError && <ErrorState description={actionError} onRetry={() => void reload()} />}
            {success && <InlineAlert tone="success">{success}</InlineAlert>}
            <Card className="volunteer-detail-card" padding="lg">
              <div className="volunteer-detail-heading">
                <div>
                  <span className="volunteer-task-reference">TASK-{task.request_id.slice(0, 8).toUpperCase()}</span>
                  <h2>{task.food_name}</h2>
                  <p>{quantityLabel(task)} · {task.description}</p>
                </div>
                <StatusBadge tone={taskTone(task.status)}>{taskStatusLabel(task.status)}</StatusBadge>
              </div>
              <div className="volunteer-route">
                <TaskLocation
                  contact={task.donor_name}
                  icon={<MapPin size={18} />}
                  label="Collect from donor"
                  phone={task.donor_phone}
                  value={task.pickup_address}
                />
                <span aria-hidden="true" className="volunteer-route-line" />
                <TaskLocation
                  contact={task.ngo_contact_name}
                  icon={<MapPin size={18} />}
                  label="Deliver to organization"
                  phone={task.ngo_contact_phone}
                  value={task.ngo_address}
                />
                {task.ngo_name && <p className="volunteer-recipient-name">{task.ngo_name}</p>}
              </div>
              <div className="volunteer-detail-facts">
                <div><CalendarClock size={17} /><span><small>Pickup schedule</small><strong>{dateLabel(task.pickup_at)}</strong></span></div>
                <div><Clock3 size={17} /><span><small>Food expiry</small><strong>{dateLabel(task.expires_at)}</strong></span></div>
                <div><Utensils size={17} /><span><small>Food handling</small><strong>{task.pickup_instructions ?? "Follow safe food-handling practices during transport."}</strong></span></div>
              </div>
              <SectionHeading title="Delivery progress" />
              <ProgressTimeline steps={taskProgress(task)} />
              {assigned && task.status === "confirmed" && (
                <TextareaField
                  hint="Optional note recorded with the pickup handover."
                  label="Pickup note"
                  maxLength={1000}
                  onChange={(event) => setNote(event.target.value)}
                  value={note}
                />
              )}
              {assigned && task.status === "picked_up" && !task.volunteer_delivered_at && (
                <InlineAlert tone="info">The pickup is recorded. Confirm delivery after the organization receives the food; its receipt confirmation completes the task.</InlineAlert>
              )}
              {task.volunteer_delivered_at && task.status !== "completed" && (
                <InlineAlert tone="success" title="Delivery recorded">The NGO still needs to confirm receipt before this task is marked completed.</InlineAlert>
              )}
              {task.status === "completed" && <InlineAlert tone="success" title="Task completed">The organization confirmed receipt on {dateLabel(task.volunteer_delivered_at)}.</InlineAlert>}
              {action && <div className="volunteer-detail-action">{action}</div>}
            </Card>
            <Card className="volunteer-task-aside" padding="lg">
              <span className="volunteer-feature-icon"><Truck aria-hidden="true" size={22} /></span>
              <SectionHeading title={assigned ? "Your delivery" : "Accept this task"} />
              <p>{assigned
                ? "Task addresses and contact details are restricted to the volunteer assigned to this pickup."
                : "Accepting assigns this task to you. Another volunteer cannot claim it at the same time."}</p>
              <Link className="volunteer-text-link" to="/volunteer/tasks">View my tasks <ArrowRight size={15} /></Link>
            </Card>
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
