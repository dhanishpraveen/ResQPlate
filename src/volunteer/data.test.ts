import { describe, expect, it } from "vitest";
import { isAssignedVolunteerTask, taskStatusLabel, type VolunteerTask } from "./data";

function task(overrides: Partial<VolunteerTask> = {}): VolunteerTask {
  return {
    request_id: "request-1",
    donation_id: "donation-1",
    food_name: "Cooked meals",
    description: "Fresh meal boxes",
    quantity: 20,
    unit: "servings",
    pickup_at: null,
    expires_at: "2026-10-30T12:00:00.000Z",
    status: "confirmed",
    donor_name: null,
    donor_phone: null,
    pickup_address: null,
    pickup_instructions: null,
    ngo_name: null,
    ngo_address: null,
    ngo_contact_name: null,
    ngo_contact_phone: null,
    volunteer_picked_up_at: null,
    volunteer_delivered_at: null,
    ...overrides,
  };
}

describe("volunteer task data helpers", () => {
  it("treats private location access as the assignment boundary", () => {
    expect(isAssignedVolunteerTask(task())).toBe(false);
    expect(isAssignedVolunteerTask(task({ pickup_address: "12 Donor Street" }))).toBe(true);
  });

  it("formats persisted lifecycle statuses for task cards", () => {
    expect(taskStatusLabel("picked_up")).toBe("Out for delivery");
    expect(taskStatusLabel("completed")).toBe("Delivered");
  });
});
