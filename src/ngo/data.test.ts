import { describe, expect, it } from "vitest";
import { buildPickupRequestValues } from "./data";

describe("pickup request payload", () => {
  it("preserves the drop-off address and coordinates added by the location migration", () => {
    const values = buildPickupRequestValues({
      donation_id: "donation-1",
      ngo_id: "ngo-1",
      requested_quantity: 24,
      pickup_at: "2030-01-01T10:00:00.000Z",
      notes: null,
      dropoff_address: "10 Market Street",
      dropoff_latitude: 12.9716,
      dropoff_longitude: 77.5946,
    });

    expect(values).toEqual(expect.objectContaining({
      donation_id: "donation-1",
      ngo_id: "ngo-1",
      requested_quantity: 24,
      pickup_at: "2030-01-01T10:00:00.000Z",
      dropoff_address: "10 Market Street",
      dropoff_latitude: 12.9716,
      dropoff_longitude: 77.5946,
    }));
  });

  it("keeps drop-off fields nullable when no location is selected", () => {
    const values = buildPickupRequestValues({
      donation_id: "donation-1",
      ngo_id: "ngo-1",
      requested_quantity: 24,
      pickup_at: null,
      notes: null,
      dropoff_address: null,
      dropoff_latitude: null,
      dropoff_longitude: null,
    });

    expect(values.dropoff_address).toBeNull();
    expect(values.dropoff_latitude).toBeNull();
    expect(values.dropoff_longitude).toBeNull();
  });
});
