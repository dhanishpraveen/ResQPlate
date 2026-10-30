import { describe, expect, it, vi } from "vitest";
import { buildPickupRequestValues, confirmNgoReceipt, createPickupRequest, fetchNgoRequest } from "./data";
import type { Database } from "../lib/database.types";

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

  it("persists the selected donation ID with the authenticated NGO request", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "request-created" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const values: Database["public"]["Tables"]["pickup_requests"]["Insert"] = {
      donation_id: "biryani-donation-id",
      ngo_id: "authenticated-ngo-id",
      requested_quantity: 12,
      pickup_at: "2030-01-01T10:00:00.000Z",
      notes: null,
      dropoff_address: null,
      dropoff_latitude: null,
      dropoff_longitude: null,
    };

    await expect(createPickupRequest({ from } as never, values)).resolves.toEqual({ id: "request-created" });
    expect(from).toHaveBeenCalledWith("pickup_requests");
    expect(insert).toHaveBeenCalledWith(values);
    expect(values.donation_id).toBe("biryani-donation-id");
  });

  it("confirms receipt through the owner-checked RPC with the handed-over quantity", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await expect(confirmNgoReceipt({ rpc } as never, "request-delivered", 12)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("confirm_ngo_receipt", {
      p_request_id: "request-delivered",
      p_received_quantity: 12,
    });
  });

  it("surfaces receipt RPC errors", async () => {
    const rpc = vi.fn().mockResolvedValue({
      error: { code: "42501", message: "Pickup request was not found for this organization" },
    });
    await expect(confirmNgoReceipt({ rpc } as never, "request-other-ngo", 12))
      .rejects.toMatchObject({ code: "42501", message: "Pickup request was not found for this organization" });
  });

  it("scopes receipt detail reads to both the authenticated NGO and request ID", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const secondEq = vi.fn().mockReturnValue({ maybeSingle });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    const select = vi.fn().mockReturnValue({ eq: firstEq });
    const from = vi.fn().mockReturnValue({ select });

    await expect(fetchNgoRequest({ from } as never, "authenticated-ngo-id", "other-ngo-request"))
      .resolves.toBeNull();
    expect(from).toHaveBeenCalledWith("pickup_requests");
    expect(firstEq).toHaveBeenCalledWith("ngo_id", "authenticated-ngo-id");
    expect(secondEq).toHaveBeenCalledWith("id", "other-ngo-request");
  });
});
