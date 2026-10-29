import type { UserRole } from "../components/navigation";
import type { Database } from "../lib/database.types";

type NgoRequiredDetails = Pick<
  Database["public"]["Tables"]["ngo_profiles"]["Row"],
  | "organization_name"
  | "organization_address"
  | "registration_number"
  | "organization_type"
  | "contact_name"
  | "contact_designation"
  | "contact_email"
  | "contact_phone"
>;

const ngoOrganizationDetailFields: Array<{ field: keyof NgoRequiredDetails; label: string }> = [
  { field: "organization_name", label: "organization name" },
  { field: "organization_address", label: "organization address" },
  { field: "registration_number", label: "registration number" },
  { field: "organization_type", label: "organization type" },
];

const ngoContactDetailFields: Array<{ field: keyof NgoRequiredDetails; label: string }> = [
  { field: "contact_name", label: "contact person's name" },
  { field: "contact_designation", label: "contact person's role/designation" },
  { field: "contact_email", label: "contact email" },
  { field: "contact_phone", label: "contact phone" },
];

const ngoRequiredDetailFields = [...ngoOrganizationDetailFields, ...ngoContactDetailFields];

function missingDetails(profile: Partial<NgoRequiredDetails> | null | undefined, fields: typeof ngoRequiredDetailFields) {
  if (!profile) return fields.map(({ label }) => label);
  return fields
    .filter(({ field }) => !profile[field]?.trim())
    .map(({ label }) => label);
}

export function getMissingNgoOrganizationDetails(profile: Partial<NgoRequiredDetails> | null | undefined) {
  return missingDetails(profile, ngoOrganizationDetailFields);
}

export function getMissingNgoProfileDetails(profile: Partial<NgoRequiredDetails> | null | undefined) {
  return missingDetails(profile, ngoRequiredDetailFields);
}

export function isNgoProfileComplete(profile: Partial<NgoRequiredDetails> | null | undefined) {
  return getMissingNgoProfileDetails(profile).length === 0;
}

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

export function callbackDestination(next: string | null, role: UserRole | null = null) {
  if (next === "/reset-password/update") return next;
  return role === "ngo" ? "/onboarding/ngo/organization" : "/onboarding/profile";
}

export function roleDestination(role: UserRole | null) {
  if (!role) return "/onboarding/role";
  if (role === "donor") return "/onboarding/donor";
  if (role === "ngo") return "/onboarding/ngo/organization";
  return "/volunteer";
}
