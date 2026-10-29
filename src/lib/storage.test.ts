import { describe, expect, it, vi } from "vitest";
import { fetchSignedImages } from "./storage";

describe("fetchSignedImages", () => {
  it("returns valid signed URLs and ignores missing or invalid results", async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { path: "donor-1/food.jpg", signedUrl: "https://signed.example/food.jpg", error: null },
        { path: "donor-1/missing.jpg", signedUrl: null, error: "Not found" },
        { path: "donor-1/invalid.jpg", signedUrl: "javascript:alert(1)", error: null },
      ],
      error: null,
    });
    const client = { storage: { from: vi.fn().mockReturnValue({ createSignedUrls }) } };

    await expect(fetchSignedImages(client as never, "donation-images", [
      "donor-1/food.jpg",
      "donor-1/missing.jpg",
      "donor-1/invalid.jpg",
    ])).resolves.toEqual(new Map([["donor-1/food.jpg", "https://signed.example/food.jpg"]]));
  });
});
