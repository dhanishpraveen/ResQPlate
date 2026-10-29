import { describe, expect, it, vi } from "vitest";
import { buildDonationWriteValues, createDonation, formatDonationSaveError, uploadPrivateImage } from "./data";
import donationLocationGrantMigration from "../../supabase/migrations/20261029235100_grant_donation_location_columns.sql?raw";

describe("donation data helpers", () => {
  it("persists pickup coordinates and the photo path in the donation payload", () => {
    const values = buildDonationWriteValues({
      food_name: "Vegetable bowls",
      cuisine_type: "Indian",
      description: "Fresh meal portions",
      quantity: 24,
      unit: "servings",
      expires_at: "2030-01-01T10:00:00.000Z",
      pickup_address: "10 Market Street",
      pickup_latitude: 12.9716,
      pickup_longitude: 77.5946,
      pickup_instructions: null,
      photo_path: "donor-1/photo.webp",
      status: "available",
    });

    expect(values.photo_path).toBe("donor-1/photo.webp");
    expect(values).toMatchObject({
      pickup_address: "10 Market Street",
      pickup_latitude: 12.9716,
      pickup_longitude: 77.5946,
    });
  });

  it("grants only the location column privileges required by donation writes", () => {
    expect(donationLocationGrantMigration).toMatch(
      /grant insert \(pickup_latitude, pickup_longitude\)\s+on public\.donations to authenticated/i,
    );
    expect(donationLocationGrantMigration).toMatch(
      /grant update \(pickup_latitude, pickup_longitude\)\s+on public\.donations to authenticated/i,
    );
    expect(donationLocationGrantMigration).not.toMatch(/grant\s+insert\s+on\s+public\.donations/i);
    expect(donationLocationGrantMigration).not.toMatch(/grant\s+update\s+on\s+public\.donations/i);
  });

  it("inserts with the authenticated donor ID and selects only the new ID", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "donation-id" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const client = { from } as never;
    const values = buildDonationWriteValues({
      food_name: "Vegetable bowls",
      cuisine_type: "Indian",
      description: "Fresh meal portions",
      quantity: 24,
      unit: "servings",
      expires_at: "2030-01-01T10:00:00.000Z",
      pickup_address: "10 Market Street",
      pickup_latitude: 12.9716,
      pickup_longitude: 77.5946,
      pickup_instructions: null,
      photo_path: null,
      status: "available",
    });

    await expect(createDonation(client, "authenticated-donor-id", values)).resolves.toBe("donation-id");
    expect(from).toHaveBeenCalledWith("donations");
    expect(insert).toHaveBeenCalledWith({ donor_id: "authenticated-donor-id", ...values });
    expect(select).toHaveBeenCalledWith("id");
  });

  it("surfaces PostgREST diagnostics while redacting sensitive data", () => {
    expect(formatDonationSaveError({
      code: "42501",
      message: "permission denied for table donations",
      details: "request by user 123e4567-e89b-42d3-a456-426614174000",
      hint: "Authorization: Bearer eyJhbGci.eyJzdWIi.abc",
    })).toBe(
      "Code: 42501 — permission denied for table donations — Details: request by user [redacted id] — Hint: Authorization=[redacted]",
    );
  });

  it("returns the storage path after a successful upload", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const client = { storage: { from: vi.fn().mockReturnValue({ upload }) } };
    const randomUuid = vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");

    await expect(uploadPrivateImage(client as never, "donation-images", "donor-1", new File(["image"], "food.png", { type: "image/png" })))
      .resolves.toBe("donor-1/00000000-0000-4000-8000-000000000001.png");
    expect(upload).toHaveBeenCalledWith(
      "donor-1/00000000-0000-4000-8000-000000000001.png",
      expect.any(File),
      { contentType: "image/png", upsert: false },
    );

    randomUuid.mockRestore();
  });

  it("surfaces storage upload failures instead of returning a broken path", async () => {
    const upload = vi.fn().mockResolvedValue({ error: new Error("storage unavailable") });
    const client = { storage: { from: vi.fn().mockReturnValue({ upload }) } };

    await expect(uploadPrivateImage(client as never, "donation-images", "donor-1", new File(["image"], "food.png", { type: "image/png" })))
      .rejects.toThrow("storage unavailable");
  });
});
