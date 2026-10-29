import { describe, expect, it } from "vitest";
import { validatePickupRequest, validateReceiptQuantity } from "./validation";

describe("NGO workflow validation", () => {
  it("requires a valid future pickup time and bounds notes", () => {
    const now = Date.parse("2026-10-29T10:00:00.000Z");
    expect(validatePickupRequest("", "", now)).toContain("valid preferred pickup");
    expect(validatePickupRequest("2026-10-29T09:00:00.000Z", "", now)).toContain("future");
    expect(validatePickupRequest("2026-10-29T11:00:00.000Z", "x".repeat(1001), now)).toContain("1,000");
    expect(validatePickupRequest("2026-10-29T11:00:00.000Z", "Gate B", now)).toBeNull();
  });

  it("permits only a positive full-quantity receipt", () => {
    expect(validateReceiptQuantity(0, 10)).toContain("positive");
    expect(validateReceiptQuantity(9, 10)).toContain("full handed-over");
    expect(validateReceiptQuantity(10, 10)).toBeNull();
  });
});
