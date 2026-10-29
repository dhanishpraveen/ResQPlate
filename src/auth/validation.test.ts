import { describe, expect, it } from "vitest";
import { callbackDestination, getMissingNgoOrganizationDetails, getMissingNgoProfileDetails, isE164Phone, isNgoProfileComplete, roleDestination, validateProfileImage } from "./validation";

describe("authentication validation", () => {
  it("accepts E.164 phone numbers and rejects local or malformed values", () => {
    expect(isE164Phone("+14155552671")).toBe(true);
    expect(isE164Phone("+442071838750")).toBe(true);
    expect(isE164Phone("4155552671")).toBe(false);
    expect(isE164Phone("+0123456789")).toBe(false);
  });

  it("only allows the supported post-auth callback destination", () => {
    expect(callbackDestination("/reset-password/update")).toBe("/reset-password/update");
    expect(callbackDestination("https://example.com")).toBe("/onboarding/profile");
    expect(callbackDestination("//example.com")).toBe("/onboarding/profile");
    expect(callbackDestination(null, "ngo")).toBe("/onboarding/ngo/organization");
    expect(callbackDestination("/reset-password/update", "ngo")).toBe("/reset-password/update");
  });

  it("resolves initial onboarding destinations from the trusted role", () => {
    expect(roleDestination(null)).toBe("/onboarding/role");
    expect(roleDestination("donor")).toBe("/onboarding/donor");
    expect(roleDestination("ngo")).toBe("/onboarding/ngo/organization");
    expect(roleDestination("volunteer")).toBe("/volunteer");
  });

  it("validates profile image file types and sizes", () => {
    expect(validateProfileImage(new File(["image"], "avatar.webp", { type: "image/webp" }))).toBeNull();
    expect(validateProfileImage(new File(["document"], "avatar.pdf", { type: "application/pdf" }))).toContain("JPG, PNG, or WebP");
  });

  it("considers required organization and contact details complete without document references", () => {
    const details = {
      organization_name: "Hope Foundation",
      organization_address: "12 Green Street",
      registration_number: "NGO-2026-01",
      organization_type: "nonprofit",
      contact_name: "Asha Kumar",
      contact_designation: "Coordinator",
      contact_email: "asha@example.org",
      contact_phone: "+14155552671",
    };

    expect(isNgoProfileComplete(details)).toBe(true);
    expect(isNgoProfileComplete({ ...details, contact_phone: " " })).toBe(false);
    expect(getMissingNgoOrganizationDetails({ ...details, registration_number: null })).toEqual(["registration number"]);
    expect(getMissingNgoProfileDetails({ ...details, registration_number: null })).toEqual(["registration number"]);
    expect(isNgoProfileComplete(null)).toBe(false);
  });
});
