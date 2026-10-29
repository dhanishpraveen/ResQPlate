import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";

export type DonationRow = Database["public"]["Tables"]["donations"]["Row"];
export type PickupRequestRow = Database["public"]["Views"]["donor_pickup_request_details"]["Row"];
export type CompletedImpactRow = Database["public"]["Views"]["donor_completed_impact"]["Row"];
type Client = SupabaseClient<Database>;

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
