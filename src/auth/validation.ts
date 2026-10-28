import type { UserRole } from "../components/navigation";

export function isE164Phone(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value.trim());
}

export function validateProfileImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Choose a JPG, PNG, or WebP image.";
  }
  if (file.size > 5 * 1024 * 1024) return "Choose an image smaller than 5 MB.";
  return null;
}

export function validateNgoDocument(file: File) {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
    return "Choose a PDF, JPG, or PNG file.";
  }
  if (file.size > 10 * 1024 * 1024) return "Choose a file no larger than 10 MB.";
  return null;
}

export function callbackDestination(next: string | null) {
  return next === "/reset-password/update" ? next : "/onboarding/profile";
}

export function roleDestination(role: UserRole | null) {
  if (!role) return "/onboarding/role";
  if (role === "donor") return "/onboarding/donor";
  if (role === "ngo") return "/onboarding/ngo/organization";
  return "/volunteer";
}
