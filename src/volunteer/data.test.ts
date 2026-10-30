import { describe, expect, it, vi } from "vitest";
import {
  coordinatesAreValid,
  distanceInKilometers,
  confirmVolunteerPickup,
  isPickupExpired,
  isAssignedVolunteerTask,
  isAvailableVolunteerTask,
  isPickupWindowCurrent,
  mapVolunteerTaskResponse,
  taskDeliveryLabel,
  taskStatusLabel,
  type VolunteerTask,
  volunteerNavigationStage,
  volunteerPickupErrorMessage,
} from "./data";
import donorWorkflowMigration from "../../supabase/migrations/20261029000000_donor_module.sql?raw";
import volunteerWorkflowMigration from "../../supabase/migrations/20261029110000_volunteer_task_workflow.sql?raw";
import volunteerExpiryVisibilityMigration from "../../supabase/migrations/20261030053000_volunteer_task_expiry_visibility.sql?raw";
import cleanupExpiredMealsScript from "../../supabase/manual/cleanup_expired_meals_20261029.sql?raw";

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

  it("only exposes confirmed, unassigned tasks while their pickup window is current", () => {
    const now = Date.parse("2026-10-30T12:00:00.000Z");
    const confirmedTask = task({ expires_at: "2026-10-30T12:00:01.000Z" });

    expect(isAvailableVolunteerTask(confirmedTask, now)).toBe(true);
    expect(isAvailableVolunteerTask(task({
      volunteer_assigned: true,
      expires_at: "2026-10-30T12:00:01.000Z",
    }), now)).toBe(false);
    expect(isAvailableVolunteerTask(task({ status: "confirmed", expires_at: "2026-10-30T11:59:59.000Z" }), now)).toBe(false);
    expect(isAvailableVolunteerTask(task({ status: "pending" }), now)).toBe(false);
  });

  it("keeps expired uncollected pickups out of active stages without hiding completed history", () => {
    const now = Date.parse("2026-10-30T12:00:00.000Z");
    const expired = { status: "confirmed" as const, expires_at: "2026-10-30T11:59:59.000Z" };

    expect(isPickupWindowCurrent(expired, now)).toBe(false);
    expect(isPickupWindowCurrent({ status: "picked_up", expires_at: expired.expires_at }, now)).toBe(true);
    expect(isPickupWindowCurrent({ status: "completed", expires_at: expired.expires_at }, now)).toBe(true);
  });

  it("keeps donor-confirmed claimed requests claimable only once and excludes expired assigned tasks", () => {
    const donorReview = donorWorkflowMigration.match(/create function public\.review_pickup_request[\s\S]*?\$\$;/i)?.[0] ?? "";
    const claimRpc = volunteerWorkflowMigration.match(/create function public\.claim_volunteer_task[\s\S]*?\$\$;/i)?.[0] ?? "";
    const listRpc = volunteerExpiryVisibilityMigration.match(/create or replace function public\.list_volunteer_tasks[\s\S]*?\$\$;/i)?.[0] ?? "";

    expect(donorReview).toMatch(/update public\.donations\s+set status = 'claimed'/i);
    expect(donorReview).toMatch(/update public\.pickup_requests\s+set status = 'confirmed'/i);
    expect(listRpc).toMatch(/r\.volunteer_id is null[\s\S]*r\.status = 'confirmed'[\s\S]*d\.status = 'claimed'[\s\S]*d\.expires_at > pg_catalog\.now\(\)/i);
    expect(listRpc).toMatch(/r\.volunteer_id = current_user_id[\s\S]*r\.status = 'confirmed'[\s\S]*d\.status = 'claimed'[\s\S]*d\.expires_at > pg_catalog\.now\(\)/i);
    expect(claimRpc).toMatch(/for update/i);
    expect(claimRpc).toMatch(/if assigned_volunteer_id is not null/i);
    expect(claimRpc).toMatch(/where id = p_request_id and volunteer_id is null and status = 'confirmed'/i);
  });

  it("keeps the manual cleanup transaction pinned to the verified expired donation", () => {
    expect(cleanupExpiredMealsScript).toMatch(/begin;\s+set local lock_timeout/i);
    expect(cleanupExpiredMealsScript).toContain("45715a9b-5773-42a5-9317-ddabe309c52e");
    expect(cleanupExpiredMealsScript).toContain("0d361edc-dba4-4132-be8b-b39babe226ae");
    expect(cleanupExpiredMealsScript).toMatch(/food_name = 'Meals'/i);
    expect(cleanupExpiredMealsScript).toMatch(/raise exception[\s\S]*transaction aborted/i);
    expect(cleanupExpiredMealsScript).toMatch(/get diagnostics deleted_count = row_count/i);
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
