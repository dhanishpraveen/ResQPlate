import { describe, expect, it } from "vitest";
import { validateDonation, validateFoodImage, type DonationDraft } from "./validation";

const validDraft: DonationDraft = {
  food_name: "Vegetable bowls",
  cuisine_type: "Indian",
  description: "Freshly prepared meal portions",
  quantity: 24,
  unit: "servings",
  expires_at: "2030-01-01T10:00:00.000Z",
  pickup_address: "10 Market Street",
  pickup_instructions: null,
  photo: null,
};

describe("donation validation", () => {
  it("accepts a complete future listing", () => {
    expect(validateDonation(validDraft, "available", Date.parse("2029-01-01T00:00:00Z"))).toBeNull();
  });

  it("requires a positive finite quantity", () => {
    expect(validateDonation({ ...validDraft, quantity: 0 }, "draft")).toContain("positive number");
    expect(validateDonation({ ...validDraft, quantity: Number.NaN }, "draft")).toContain("positive number");
  });

  it("prevents publishing expired donations but permits saving them as drafts", () => {
    const expired = { ...validDraft, expires_at: "2020-01-01T00:00:00.000Z" };
    expect(validateDonation(expired, "available", Date.parse("2021-01-01T00:00:00Z"))).toContain("past");
    expect(validateDonation(expired, "draft", Date.parse("2021-01-01T00:00:00Z"))).toBeNull();
  });

  it("validates required text and file constraints", () => {
    expect(validateDonation({ ...validDraft, food_name: "  " }, "draft")).toContain("food name");
    expect(validateFoodImage(new File(["image"], "photo.png", { type: "image/png" }))).toBeNull();
    expect(validateFoodImage(new File(["file"], "photo.svg", { type: "image/svg+xml" }))).toContain("JPG, PNG, or WebP");
  });
});
