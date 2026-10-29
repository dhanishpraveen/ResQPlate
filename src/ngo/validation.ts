export function validatePickupRequest(pickupAt: string, notes: string, now = Date.now()) {
  const pickupTime = new Date(pickupAt).getTime();
  if (!pickupAt || !Number.isFinite(pickupTime)) return "Choose a valid preferred pickup date and time.";
  if (pickupTime <= now) return "Choose a pickup time in the future.";
  if (notes.length > 1000) return "Additional notes must be 1,000 characters or fewer.";
  return null;
}

export function validateReceiptQuantity(value: number, expected: number) {
  if (!Number.isFinite(value) || value <= 0) return "Enter a positive received quantity.";
  if (value !== expected) return "The current receipt workflow requires the full handed-over quantity.";
  return null;
}
