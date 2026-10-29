import { describe, expect, it, vi } from "vitest";
import {
  coordinatesAreValid,
  distanceInKilometers,
  confirmVolunteerPickup,
  isPickupExpired,
  isAssignedVolunteerTask,
  mapVolunteerTaskResponse,
  taskDeliveryLabel,
  taskStatusLabel,
  type VolunteerTask,
  volunteerNavigationStage,
  volunteerPickupErrorMessage,
} from "./data";

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
    pickup_latitude: null,
    pickup_longitude: null,
    dropoff_address: null,
    dropoff_latitude: null,
    dropoff_longitude: null,
    volunteer_assigned: false,
    ...overrides,
  };
}

describe("volunteer task data helpers", () => {
  it("uses the persisted assignment flag as the assignment boundary", () => {
    expect(isAssignedVolunteerTask(task())).toBe(false);
    expect(isAssignedVolunteerTask(task({ pickup_address: "12 Donor Street" }))).toBe(false);
    expect(isAssignedVolunteerTask(task({ volunteer_assigned: true }))).toBe(true);
  });

  it("formats persisted lifecycle statuses for task cards", () => {
    expect(taskStatusLabel("picked_up")).toBe("Out for delivery");
    expect(taskStatusLabel("completed")).toBe("Delivered");
  });

  it("reports expired confirmed pickups instead of showing pickup pending", () => {
    const now = Date.parse("2026-10-30T12:00:00.000Z");
    const expiredTask = task({ expires_at: "2026-10-30T11:59:59.000Z" });

    expect(isPickupExpired(expiredTask.expires_at, now)).toBe(true);
    expect(isPickupExpired("2026-10-30T12:00:01.000Z", now)).toBe(false);
    expect(taskDeliveryLabel(expiredTask, now)).toBe("Pickup expired");
  });

  it("maps pickup RPC readiness and authorization errors to useful messages", () => {
    expect(volunteerPickupErrorMessage({
      code: "P0001",
      message: "Pickup cannot be confirmed for this task",
    })).toContain("donation has expired");
    expect(volunteerPickupErrorMessage({
      code: "42501",
      message: "Task is not assigned to this volunteer",
    })).toContain("no longer assigned");
  });

  it("calls the pickup RPC with its typed request and note parameters", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });

    await expect(confirmVolunteerPickup({ rpc } as never, "request-1", "Collected safely"))
      .resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("volunteer_confirm_pickup", {
      p_request_id: "request-1",
      p_note: "Collected safely",
    });
  });

  it("switches the active navigation destination only after persisted task transitions", () => {
    expect(volunteerNavigationStage(task())).toBe("before_acceptance");
    expect(volunteerNavigationStage(task({ volunteer_assigned: true }))).toBe("pickup");
    expect(volunteerNavigationStage(task({
      volunteer_assigned: true,
      status: "picked_up",
      volunteer_picked_up_at: "2026-10-29T12:00:00.000Z",
    }))).toBe("dropoff");
    expect(volunteerNavigationStage(task({
      volunteer_assigned: true,
      status: "picked_up",
      volunteer_picked_up_at: "2026-10-29T12:00:00.000Z",
      volunteer_delivered_at: "2026-10-29T13:00:00.000Z",
    }))).toBe("awaiting_receipt");
  });

  it("validates saved coordinates and calculates a real distance", () => {
    expect(coordinatesAreValid(12.9716, 77.5946)).toBe(true);
    expect(coordinatesAreValid(null, 77.5946)).toBe(false);
    expect(distanceInKilometers(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
  });

  it("accepts the RPC location fields for an unassigned task", () => {
    const availableTask = task({
      pickup_address: "10 Donor Road",
      pickup_latitude: 12.9716,
      pickup_longitude: 77.5946,
      dropoff_address: "20 NGO Lane",
      dropoff_latitude: 12.9352,
      dropoff_longitude: 77.6245,
      volunteer_assigned: false,
    });

    expect(availableTask).toMatchObject({
      pickup_address: "10 Donor Road",
      pickup_latitude: 12.9716,
      pickup_longitude: 77.5946,
      dropoff_address: "20 NGO Lane",
      dropoff_latitude: 12.9352,
      dropoff_longitude: 77.6245,
      volunteer_assigned: false,
    });
  });

  it("maps the actual RPC row field names into the UI task shape", () => {
    const mapped = mapVolunteerTaskResponse([{
      ...task({
        pickup_address: "10 Donor Road",
        pickup_latitude: 12.9716,
        pickup_longitude: 77.5946,
        dropoff_address: "20 NGO Lane",
        dropoff_latitude: 12.9352,
        dropoff_longitude: 77.6245,
      }),
    }]);

    expect(mapped[0]).toMatchObject({
      pickup_address: "10 Donor Road",
      pickup_latitude: 12.9716,
      pickup_longitude: 77.5946,
      dropoff_address: "20 NGO Lane",
      dropoff_latitude: 12.9352,
      dropoff_longitude: 77.6245,
      volunteer_assigned: false,
    });
  });

  it("reports when the live RPC has the old return shape", () => {
    const oldRpcRow = { ...task() } as Record<string, unknown>;
    delete oldRpcRow.pickup_latitude;
    delete oldRpcRow.pickup_longitude;
    delete oldRpcRow.dropoff_address;
    delete oldRpcRow.dropoff_latitude;
    delete oldRpcRow.dropoff_longitude;
    delete oldRpcRow.volunteer_assigned;

    expect(() => mapVolunteerTaskResponse([oldRpcRow]))
      .toThrow("list_volunteer_tasks is missing pickup_latitude, pickup_longitude, dropoff_address, dropoff_latitude, dropoff_longitude, volunteer_assigned");
  });
});
