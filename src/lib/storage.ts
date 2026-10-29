import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

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
