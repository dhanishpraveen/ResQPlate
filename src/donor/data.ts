import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";

export type DonationRow = Database["public"]["Tables"]["donations"]["Row"];
export type PickupRequestRow = Database["public"]["Views"]["donor_pickup_request_details"]["Row"];
export type CompletedImpactRow = Database["public"]["Views"]["donor_completed_impact"]["Row"];
export type PickupRequestStatus = Database["public"]["Tables"]["pickup_requests"]["Row"]["status"];
type Client = SupabaseClient<Database>;

type DonationSaveError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

export type DonationWriteValues = {
  food_name: string;
  cuisine_type: string;
  description: string;
  quantity: number;
  unit: DonationRow["unit"];
  expires_at: string;
  pickup_address: string;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  pickup_instructions: string | null;
  photo_path: string | null;
  status: DonationRow["status"];
};

export function buildDonationWriteValues(input: DonationWriteValues): DonationWriteValues {
  return input;
}

function safeErrorText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .replace(/\b(access_token|refresh_token|authorization|apikey|service_role)\s*[:=]\s*(?:Bearer\s+)?[^,\s;]+/gi, "$1=[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[\w-]*\.[\w-]+\.[\w-]+\b/g, "[redacted token]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[redacted id]")
    .replace(/\b[0-9a-f]{64}\b/gi, "[redacted hash]")
    .replace(/(?<!\w)\+?\d[\d\s().-]{7,}\d(?!\w)/g, "[redacted phone]")
    .slice(0, 500);
}

export function formatDonationSaveError(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return safeErrorText(error) ?? "Could not save the donation.";
  }

  const fields = error as DonationSaveError;
  const code = safeErrorText(fields.code);
  const message = safeErrorText(fields.message);
  const details = safeErrorText(fields.details);
  const hint = safeErrorText(fields.hint);
  const summary = [
    code ? `Code: ${code}` : null,
    message,
    details ? `Details: ${details}` : null,
    hint ? `Hint: ${hint}` : null,
  ].filter((part): part is string => Boolean(part));

  return summary.join(" — ") || "Could not save the donation.";
}

export function formatSupabaseError(error: unknown): string {
  const fields = typeof error === "object" && error !== null
    ? error as DonationSaveError
    : { message: error };
  const code = safeErrorText(fields.code);
  const message = safeErrorText(fields.message);
  return [code ? `Code: ${code}` : null, message]
    .filter((part): part is string => Boolean(part))
    .join(" — ") || "The request could not be completed.";
}

export function canConfirmDonorHandover(
  requestStatus: PickupRequestStatus,
  donationStatus: DonationRow["status"],
  volunteerAssigned: boolean,
): boolean {
  return requestStatus === "confirmed" && donationStatus === "claimed" && !volunteerAssigned;
}

export async function createDonation(client: Client, donorId: string, values: DonationWriteValues) {
  if (!donorId.trim()) {
    throw new Error("Your donor account could not be verified. Sign out and sign in again before saving.");
  }

  const { data, error } = await client
    .from("donations")
    .insert({ donor_id: donorId, ...values })
    .select("id")
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("The donation was not confirmed as saved. Refresh your donation history before retrying.");
  return data.id;
}

export async function reviewPickupRequest(
  client: Client,
  requestId: string,
  action: "confirm" | "decline",
) {
  const { error } = await client.rpc("review_pickup_request", {
    p_request_id: requestId,
    p_action: action,
  });
  if (error) throw error;
}

export async function fetchDonations(client: Client, donorId: string) {
  const { data, error } = await client
    .from("donations")
    .select("*")
    .eq("donor_id", donorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchPickupRequests(client: Client) {
  const { data, error } = await client
    .from("donor_pickup_request_details")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchPickupRequestVolunteerAssignment(client: Client, requestId: string) {
  const { data, error } = await client
    .from("pickup_requests")
    .select("volunteer_id")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This pickup request is unavailable or not related to your donations.");
  return data.volunteer_id !== null;
}

export { fetchSignedImages } from "../lib/storage";

export async function fetchCompletedImpact(client: Client) {
  const { data, error } = await client
    .from("donor_completed_impact")
    .select("*")
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function uploadPrivateImage(
  client: Client,
  bucket: "donation-images" | "handover-evidence",
  userId: string,
  file: File,
) {
  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}
