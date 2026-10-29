import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";

type Client = SupabaseClient<Database>;
type DonationRow = Database["public"]["Tables"]["donations"]["Row"];
type RequestRow = Database["public"]["Tables"]["pickup_requests"]["Row"];
type RequestHistoryRow = Database["public"]["Tables"]["pickup_request_status_history"]["Row"];
type HandoverRow = Database["public"]["Tables"]["donation_handovers"]["Row"];
type ProfileRow = Database["public"]["Tables"]["ngo_profiles"]["Row"];

export type NgoDonation = Pick<
  DonationRow,
  "id" | "food_name" | "cuisine_type" | "description" | "quantity" | "unit" | "expires_at" | "status" | "created_at" | "photo_path"
>;
export type NgoRequest = Pick<
  RequestRow,
  "id" | "donation_id" | "ngo_id" | "requested_quantity" | "pickup_at" | "notes" | "status" |
  "received_quantity" | "receipt_confirmed_at" | "created_at" | "updated_at"
>;
export type NgoRequestHistory = Pick<RequestHistoryRow, "status" | "changed_at">;
export type NgoHandover = Pick<HandoverRow, "recorded_at">;
export type NgoProfile = Pick<
  ProfileRow,
  "id" | "organization_name" | "organization_address" | "registration_number" | "organization_type" |
  "description" | "contact_name" | "contact_designation" | "contact_email" | "contact_phone" |
  "registration_certificate_path" | "ngo_proof_path"
>;

export async function fetchAvailableDonations(client: Client) {
  const { data, error } = await client.rpc("list_available_donations", { p_donation_id: null });
  if (error) throw error;
  return data;
}

export async function fetchNgoRequests(client: Client, ngoId: string) {
  const { data, error } = await client
    .from("pickup_requests")
    .select("id, donation_id, ngo_id, requested_quantity, pickup_at, notes, status, received_quantity, receipt_confirmed_at, created_at, updated_at")
    .eq("ngo_id", ngoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchNgoRequest(client: Client, ngoId: string, requestId: string) {
  const { data, error } = await client
    .from("pickup_requests")
    .select("id, donation_id, ngo_id, requested_quantity, pickup_at, notes, status, received_quantity, receipt_confirmed_at, created_at, updated_at")
    .eq("ngo_id", ngoId)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchActiveNgoRequest(client: Client, ngoId: string, donationId: string) {
  const { data, error } = await client
    .from("pickup_requests")
    .select("id")
    .eq("ngo_id", ngoId)
    .eq("donation_id", donationId)
    .in("status", ["pending", "confirmed", "picked_up"])
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createPickupRequest(
  client: Client,
  requestValues: Database["public"]["Tables"]["pickup_requests"]["Insert"],
) {
  const { data, error } = await client
    .from("pickup_requests")
    .insert(requestValues)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchDonation(client: Client, donationId: string) {
  const { data, error } = await client
    .rpc("list_available_donations", { p_donation_id: donationId })
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchRequestHistory(client: Client, requestId: string) {
  const { data, error } = await client
    .from("pickup_request_status_history")
    .select("status, changed_at")
    .eq("pickup_request_id", requestId)
    .order("changed_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchHandover(client: Client, requestId: string) {
  const { data, error } = await client
    .from("donation_handovers")
    .select("recorded_at")
    .eq("pickup_request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchNgoProfile(client: Client, ngoId: string) {
  const { data, error } = await client
    .from("ngo_profiles")
    .select("id, organization_name, organization_address, registration_number, organization_type, description, contact_name, contact_designation, contact_email, contact_phone, registration_certificate_path, ngo_proof_path")
    .eq("id", ngoId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createNgoDocumentUrl(client: Client, path: string) {
  const { data, error } = await client.storage
    .from("ngo-verification")
    .createSignedUrl(path, 60);
  if (error) throw error;
  if (!data.signedUrl) throw new Error("The private legacy document could not be opened.");
  return data.signedUrl;
}
