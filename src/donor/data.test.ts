import { describe, expect, it, vi } from "vitest";
import { buildDonationWriteValues, uploadPrivateImage } from "./data";

describe("donation data helpers", () => {
  it("keeps the photo storage path in the donation write payload without unsupported columns", () => {
    const values = buildDonationWriteValues({
      food_name: "Vegetable bowls",
      cuisine_type: "Indian",
      description: "Fresh meal portions",
      quantity: 24,
      unit: "servings",
      expires_at: "2030-01-01T10:00:00.000Z",
      pickup_address: "10 Market Street",
      pickup_instructions: null,
      photo_path: "donor-1/photo.webp",
      status: "available",
    });

    expect(values.photo_path).toBe("donor-1/photo.webp");
    expect(values).not.toHaveProperty("pickup_latitude");
    expect(values).not.toHaveProperty("pickup_longitude");
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
