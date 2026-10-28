import { describe, expect, it } from "vitest";
import { callbackDestination, isE164Phone, roleDestination, validateNgoDocument, validateProfileImage } from "./validation";

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
  });

  it("resolves initial onboarding destinations from the trusted role", () => {
    expect(roleDestination(null)).toBe("/onboarding/role");
    expect(roleDestination("donor")).toBe("/onboarding/donor");
    expect(roleDestination("ngo")).toBe("/onboarding/ngo/organization");
    expect(roleDestination("volunteer")).toBe("/volunteer");
  });

  it("validates private profile and NGO document file types and sizes", () => {
    expect(validateProfileImage(new File(["image"], "avatar.webp", { type: "image/webp" }))).toBeNull();
    expect(validateProfileImage(new File(["document"], "avatar.pdf", { type: "application/pdf" }))).toContain("JPG, PNG, or WebP");
    expect(validateNgoDocument(new File(["document"], "proof.pdf", { type: "application/pdf" }))).toBeNull();
    expect(validateNgoDocument(new File(["image"], "proof.gif", { type: "image/gif" }))).toContain("PDF, JPG, or PNG");
  });
});
