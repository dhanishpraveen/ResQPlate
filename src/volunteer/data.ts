import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";

type Client = SupabaseClient<Database>;
export type VolunteerTask = Database["public"]["Functions"]["list_volunteer_tasks"]["Returns"][number];

export async function fetchVolunteerTasks(client: Client) {
  const { data, error } = await client.rpc("list_volunteer_tasks");
  if (error) throw error;
  return data;
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

export async function confirmVolunteerDelivery(client: Client, requestId: string) {
  const { error } = await client.rpc("volunteer_confirm_delivery", { p_request_id: requestId });
  if (error) throw error;
}

export function isAssignedVolunteerTask(task: VolunteerTask) {
  return task.pickup_address !== null;
}

export function taskStatusLabel(status: VolunteerTask["status"]) {
  if (status === "confirmed") return "Ready to collect";
  if (status === "picked_up") return "Out for delivery";
  if (status === "completed") return "Delivered";
  return status.replaceAll("_", " ");
}
