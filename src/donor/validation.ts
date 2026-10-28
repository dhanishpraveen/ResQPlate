import type { Database } from "../lib/database.types";

export type DonationDraft = Pick<
  Database["public"]["Tables"]["donations"]["Insert"],
  "food_name" | "cuisine_type" | "description" | "quantity" | "unit" | "expires_at" | "pickup_address"
> & {
  pickup_instructions: string | null;
  photo: File | null;
};

export function validateDonation(draft: DonationDraft, status: "draft" | "available", now = Date.now()) {
  if (!draft.food_name.trim()) return "Enter the food name.";
  if (!draft.cuisine_type.trim()) return "Enter the cuisine type.";
  if (!draft.description.trim()) return "Add a short food description.";
  if (!Number.isFinite(draft.quantity) || draft.quantity <= 0) return "Quantity must be a positive number.";
  if (!["servings", "portions", "kg", "items"].includes(draft.unit)) return "Choose a supported quantity unit.";
  if (!draft.pickup_address.trim()) return "Enter the pickup address.";
  const expiry = new Date(draft.expires_at).getTime();
  if (!Number.isFinite(expiry)) return "Enter a valid availability or expiry time.";
  if (status === "available" && expiry <= now) return "A donation cannot be published with an expiry time in the past.";
  return null;
}

export function validateFoodImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Choose a JPG, PNG, or WebP food image.";
  }
  if (file.size > 5 * 1024 * 1024) return "Choose a food image smaller than 5 MB.";
  return null;
}
