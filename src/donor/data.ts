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

export async function fetchSignedImages(
  client: Client,
  bucket: "donation-images" | "handover-evidence",
  paths: Array<string | null>,
) {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (uniquePaths.length === 0) return new Map<string, string>();
  const { data, error } = await client.storage.from(bucket).createSignedUrls(uniquePaths, 300);
  if (error) throw error;
  const urls = new Map<string, string>();
  for (const result of data) {
    if (!result.path || !result.signedUrl) {
      throw new Error(result.error ?? "A private image could not be opened.");
    }
    urls.set(result.path, result.signedUrl);
  }
  return urls;
}

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
