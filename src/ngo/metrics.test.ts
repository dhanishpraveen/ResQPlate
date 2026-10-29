import { describe, expect, it } from "vitest";
import type { NgoRequest } from "./data";
import {
  filterNgoDeliveries,
  filterNgoRequests,
  matchesNgoRequest,
  ngoRequestLabel,
  summarizeNgoRequests,
} from "./metrics";

function request(id: string, status: NgoRequest["status"]): NgoRequest {
  return {
    id,
    donation_id: `donation-${id}`,
    ngo_id: "ngo-1",
    requested_quantity: 12,
    pickup_at: null,
    notes: null,
    status,
    received_quantity: status === "completed" ? 12 : null,
    receipt_confirmed_at: null,
    volunteer_id: null,
    volunteer_picked_up_at: null,
    volunteer_delivered_at: null,
    delivery_verification_status: status === "completed" ? "verified" : "pending",
    delivery_verified_at: status === "completed" ? "2026-10-29T11:00:00.000Z" : null,
    delivery_issue_reason: null,
    created_at: "2026-10-29T10:00:00.000Z",
    updated_at: "2026-10-29T10:00:00.000Z",
  };
}

describe("NGO request and delivery metrics", () => {
  const requests = [
    request("pending-1", "pending"),
    request("accepted-1", "confirmed"),
    request("collected-1", "picked_up"),
    request("received-1", "completed"),
    request("declined-1", "declined"),
  ];

  it("maps backend request states to NGO-facing labels", () => {
    expect(ngoRequestLabel("confirmed")).toBe("Accepted");
    expect(ngoRequestLabel("picked_up")).toBe("In transit");
    expect(ngoRequestLabel("completed")).toBe("Received");
  });

  it("filters requests and accepted pickups using persisted statuses", () => {
    expect(filterNgoRequests(requests, "accepted").map(({ id }) => id)).toEqual(["accepted-1"]);
    expect(filterNgoDeliveries(requests, "in_transit").map(({ id }) => id)).toEqual(["collected-1"]);
    expect(filterNgoDeliveries(requests, "scheduled").map(({ id }) => id)).toEqual(["accepted-1"]);
  });

  it("summarizes only the corresponding request states", () => {
    expect(summarizeNgoRequests(requests)).toEqual({
      pending: 1,
      active: 2,
      completed: 1,
      declined: 1,
    });
  });

  it("searches only the organization's request and donation references", () => {
    expect(matchesNgoRequest(requests[0], "PENDING-1")).toBe(true);
    expect(matchesNgoRequest(requests[0], "donation-pending-1")).toBe(true);
    expect(matchesNgoRequest(requests[0], "unrelated")).toBe(false);
  });
});
