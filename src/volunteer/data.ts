import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";

type Client = SupabaseClient<Database>;
export type VolunteerTask = Database["public"]["Functions"]["list_volunteer_tasks"]["Returns"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`list_volunteer_tasks returned an invalid ${key}.`);
  return value;
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value !== null && typeof value !== "string") throw new Error(`list_volunteer_tasks returned an invalid ${key}.`);
  return value;
}

function nullableNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`list_volunteer_tasks returned an invalid ${key}.`);
  }
  return value;
}

const taskStatuses: readonly VolunteerTask["status"][] = [
  "pending", "confirmed", "declined", "picked_up", "completed", "cancelled",
];
const taskUnits: readonly VolunteerTask["unit"][] = ["servings", "portions", "kg", "items"];

function mapVolunteerTaskRow(value: unknown): VolunteerTask {
  if (!isRecord(value)) throw new Error("list_volunteer_tasks returned an invalid task row.");

  const requiredLocationFields = [
    "pickup_latitude",
    "pickup_longitude",
    "dropoff_address",
    "dropoff_latitude",
    "dropoff_longitude",
    "volunteer_assigned",
  ];
  const missingLocationFields = requiredLocationFields.filter((field) => !(field in value));
  if (missingLocationFields.length > 0) {
    throw new Error(
      `list_volunteer_tasks is missing ${missingLocationFields.join(", ")}. Apply migration 20261029203000_volunteer_task_location_rpc.sql.`,
    );
  }

  const statusValue = requiredString(value, "status");
  if (!taskStatuses.some((status) => status === statusValue)) {
    throw new Error("list_volunteer_tasks returned an unsupported task status.");
  }
  const unitValue = requiredString(value, "unit");
  if (!taskUnits.some((unit) => unit === unitValue)) {
    throw new Error("list_volunteer_tasks returned an unsupported quantity unit.");
  }
  if (typeof value.quantity !== "number" || !Number.isFinite(value.quantity)) {
    throw new Error("list_volunteer_tasks returned an invalid quantity.");
  }
  if (typeof value.volunteer_assigned !== "boolean") {
    throw new Error("list_volunteer_tasks returned an invalid volunteer_assigned value.");
  }

  return {
    request_id: requiredString(value, "request_id"),
    donation_id: requiredString(value, "donation_id"),
    food_name: requiredString(value, "food_name"),
    description: requiredString(value, "description"),
    quantity: value.quantity,
    unit: unitValue as VolunteerTask["unit"],
    pickup_at: nullableString(value, "pickup_at"),
    expires_at: requiredString(value, "expires_at"),
    status: statusValue as VolunteerTask["status"],
    donor_name: nullableString(value, "donor_name"),
    donor_phone: nullableString(value, "donor_phone"),
    pickup_address: nullableString(value, "pickup_address"),
    pickup_instructions: nullableString(value, "pickup_instructions"),
    ngo_name: nullableString(value, "ngo_name"),
    ngo_address: nullableString(value, "ngo_address"),
    ngo_contact_name: nullableString(value, "ngo_contact_name"),
    ngo_contact_phone: nullableString(value, "ngo_contact_phone"),
    volunteer_picked_up_at: nullableString(value, "volunteer_picked_up_at"),
    volunteer_delivered_at: nullableString(value, "volunteer_delivered_at"),
    pickup_latitude: nullableNumber(value, "pickup_latitude"),
    pickup_longitude: nullableNumber(value, "pickup_longitude"),
    dropoff_address: nullableString(value, "dropoff_address"),
    dropoff_latitude: nullableNumber(value, "dropoff_latitude"),
    dropoff_longitude: nullableNumber(value, "dropoff_longitude"),
    volunteer_assigned: value.volunteer_assigned,
  };
}

export function mapVolunteerTaskResponse(value: unknown): VolunteerTask[] {
  if (!Array.isArray(value)) throw new Error("list_volunteer_tasks returned an invalid response.");
  return value.map(mapVolunteerTaskRow);
}

export async function fetchVolunteerTasks(client: Client) {
  const { data, error } = await client.rpc("list_volunteer_tasks");
  if (error) throw error;
  return mapVolunteerTaskResponse(data);
}

export async function claimVolunteerTask(client: Client, requestId: string) {
  const { error } = await client.rpc("claim_volunteer_task", { p_request_id: requestId });
  if (error) throw error;
}

export async function confirmVolunteerPickup(client: Client, requestId: string, note: string | null) {
  const { error } = await client.rpc("volunteer_confirm_pickup", {
    p_request_id: requestId,
    p_note: note,
  });
  if (error) throw error;
}

export function isPickupExpired(expiresAt: string, now = Date.now()) {
  const expiresAtTime = Date.parse(expiresAt);
  return Number.isFinite(expiresAtTime) && expiresAtTime <= now;
}

export function volunteerPickupErrorMessage(error: unknown) {
  const message = typeof error === "object" && error !== null && "message" in error
    && typeof error.message === "string"
    ? error.message
    : error instanceof Error ? error.message : "";

  if (message === "Pickup cannot be confirmed for this task") {
    return "This donation has expired and pickup can no longer be confirmed. Contact the donor or NGO to arrange next steps.";
  }
  if (message === "Task is not assigned to this volunteer") {
    return "This task is no longer assigned to your volunteer account. Refresh the task list.";
  }
  if (message === "A completed volunteer profile is required to confirm pickup") {
    return "Complete your volunteer profile before confirming a pickup.";
  }
  return message || "Pickup confirmation could not be completed.";
}

export function isAssignedVolunteerTask(task: VolunteerTask) {
  return typeof task.volunteer_assigned === "boolean"
    ? task.volunteer_assigned
    : task.pickup_address !== null;
}

export function taskStatusLabel(status: VolunteerTask["status"]) {
  if (status === "confirmed") return "Ready to collect";
  if (status === "picked_up") return "Out for delivery";
  if (status === "completed") return "Delivered";
  return status.replaceAll("_", " ");
}

export function taskDeliveryLabel(task: VolunteerTask, now = Date.now()) {
  if (task.status === "completed") return "Verified";
  if (task.volunteer_delivered_at) return "Awaiting NGO confirmation";
  if (task.volunteer_picked_up_at) return "In transit";
  if (task.status === "confirmed" && isPickupExpired(task.expires_at, now)) return "Pickup expired";
  if (task.status === "confirmed") return "Pickup pending";
  return taskStatusLabel(task.status);
}

export function volunteerNavigationStage(task: VolunteerTask) {
  if (!isAssignedVolunteerTask(task)) return "before_acceptance" as const;
  if (task.volunteer_delivered_at || task.status === "completed") return "awaiting_receipt" as const;
  if (task.volunteer_picked_up_at) return "dropoff" as const;
  return "pickup" as const;
}

export function coordinatesAreValid(latitude: number | null, longitude: number | null) {
  return latitude !== null && longitude !== null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}

export function coordinatePair(
  latitude: number | null,
  longitude: number | null,
): { latitude: number; longitude: number } | null {
  return coordinatesAreValid(latitude, longitude)
    ? { latitude: latitude!, longitude: longitude! }
    : null;
}

export function distanceInKilometers(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
) {
  const earthRadius = 6371;
  const latitudeDelta = (secondLatitude - firstLatitude) * Math.PI / 180;
  const longitudeDelta = (secondLongitude - firstLongitude) * Math.PI / 180;
  const first = firstLatitude * Math.PI / 180;
  const second = secondLatitude * Math.PI / 180;
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.sin(longitudeDelta / 2) ** 2 * Math.cos(first) * Math.cos(second);
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
