export function canManageNgoDeliveryOtp(
  role: unknown,
  userId: string,
  requestNgoId: string,
): boolean {
  return role === "ngo" && userId === requestNgoId;
}
