import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { VolunteerTask } from "./data";
import { VolunteerTaskDetailsPage } from "./pages";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/supabase", () => ({
  supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
  supabaseConfigurationError: null,
}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="active-delivery-map">{children}</div>,
  Marker: () => <span data-testid="map-marker" />,
  TileLayer: () => null,
  useMap: () => ({ invalidateSize: vi.fn(), fitBounds: vi.fn(), setView: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const task = (): VolunteerTask => ({
  request_id: "request-0001",
  donation_id: "donation-0001",
  food_name: "Meal boxes",
  description: "Prepared food",
  quantity: 12,
  unit: "servings",
  pickup_at: null,
  expires_at: "2026-10-30T12:00:00.000Z",
  status: "confirmed",
  donor_name: "Donor",
  donor_phone: "+15555550101",
  pickup_address: "10 Donor Road",
  pickup_instructions: null,
  ngo_name: "Receiving NGO",
  ngo_address: "20 NGO Lane",
  ngo_contact_name: "NGO contact",
  ngo_contact_phone: "+15555550102",
  volunteer_picked_up_at: null,
  volunteer_delivered_at: null,
  pickup_latitude: 12.9716,
  pickup_longitude: 77.5946,
  dropoff_address: "20 NGO Lane",
  dropoff_latitude: 12.9352,
  dropoff_longitude: 77.6245,
  volunteer_assigned: false,
});

let currentTask: VolunteerTask;

function renderTaskPage() {
  return render(
    <MemoryRouter initialEntries={["/volunteer/tasks/request-0001"]}>
      <Routes>
        <Route element={<VolunteerTaskDetailsPage />} path="/volunteer/tasks/:requestId" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("volunteer task navigation stages", () => {
  beforeEach(() => {
    currentTask = task();
    mocks.rpc.mockReset().mockImplementation(async (name: string) => {
      if (name === "list_volunteer_tasks") return { data: [{ ...currentTask }], error: null };
      if (name === "claim_volunteer_task") currentTask = { ...currentTask, volunteer_assigned: true };
      if (name === "volunteer_confirm_pickup") {
        currentTask = {
          ...currentTask,
          status: "picked_up",
          volunteer_picked_up_at: "2026-10-29T12:00:00.000Z",
        };
      }
      return { data: null, error: null };
    });
    mocks.invoke.mockReset().mockImplementation(async (_name: string, options: { body: { action: string } }) => {
      if (options.body.action === "verify") {
        currentTask = { ...currentTask, volunteer_delivered_at: "2026-10-29T13:00:00.000Z" };
      }
      return { data: { ok: true }, error: null };
    });
    vi.mocked(useAuth).mockReturnValue({
      session: { user: { id: "volunteer-1", email: "volunteer@example.org" } } as ReturnType<typeof useAuth>["session"],
      profile: { full_name: "Volunteer" } as ReturnType<typeof useAuth>["profile"],
    } as ReturnType<typeof useAuth>);
  });

  it("shows both addresses and distance before acceptance without a map or location request", async () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    renderTaskPage();

    expect(await screen.findByText("10 Donor Road")).toBeInTheDocument();
    expect(screen.getByText("20 NGO Lane")).toBeInTheDocument();
    expect(screen.getByText(/Estimated distance:/)).toBeInTheDocument();
    expect(screen.queryByTestId("active-delivery-map")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept Task" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use my location/ })).not.toBeInTheDocument();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("shows only the pickup map after acceptance and switches to NGO after persisted pickup", async () => {
    renderTaskPage();
    fireEvent.click(await screen.findByRole("button", { name: "Accept Task" }));

    expect(await screen.findByRole("button", { name: "Mark Food Collected" })).toBeInTheDocument();
    expect(screen.getByText("10 Donor Road")).toBeInTheDocument();
    expect(screen.queryByText("20 NGO Lane")).not.toBeInTheDocument();
    expect(screen.getByTestId("active-delivery-map")).toBeInTheDocument();
    expect(screen.getAllByTestId("map-marker")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Mark Food Collected" }));
    expect(await screen.findByRole("textbox", { name: "Four-digit NGO delivery code" })).toBeInTheDocument();
    expect(screen.getByText("20 NGO Lane")).toBeInTheDocument();
    expect(screen.queryByText("10 Donor Road")).not.toBeInTheDocument();
    expect(screen.getByTestId("active-delivery-map")).toBeInTheDocument();
    expect(screen.getAllByTestId("map-marker")).toHaveLength(1);
  });

  it("requests browser location only on demand and handles denied permission", async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    renderTaskPage();
    fireEvent.click(await screen.findByRole("button", { name: "Accept Task" }));
    expect(getCurrentPosition).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Use my location for directions" }));
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledOnce());
    expect(await screen.findByText(/current location could not be read/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open pickup directions/ })).toBeInTheDocument();
  });

  it("uses the current location as directions origin only after permission is granted", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 12.9, longitude: 77.5 } as GeolocationCoordinates,
      } as GeolocationPosition);
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    renderTaskPage();
    fireEvent.click(await screen.findByRole("button", { name: "Accept Task" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use my location for directions" }));

    const directions = await screen.findByRole("link", { name: "Directions to pickup" });
    expect(directions.getAttribute("href")).toContain("origin=12.9,77.5");
    expect(screen.getAllByTestId("map-marker")).toHaveLength(2);
  });

  it("keeps the saved pickup address available when its coordinates are missing", async () => {
    currentTask = {
      ...task(),
      volunteer_assigned: true,
      pickup_latitude: null,
      pickup_longitude: null,
    };

    renderTaskPage();

    expect(await screen.findByText("10 Donor Road")).toBeInTheDocument();
    expect(screen.queryByTestId("active-delivery-map")).not.toBeInTheDocument();
    expect(screen.getByText(/Pickup coordinates are unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open pickup directions/ })).toBeInTheDocument();
  });

  it("verifies the four-digit NGO code through the Edge Function only", async () => {
    renderTaskPage();
    fireEvent.click(await screen.findByRole("button", { name: "Accept Task" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark Food Collected" }));

    const codeInput = await screen.findByRole("textbox", { name: "Four-digit NGO delivery code" });
    fireEvent.change(codeInput, { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify delivery code" }));

    expect(await screen.findByText("Delivery verification is complete; awaiting NGO receipt confirmation.")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith("delivery-otp", {
      body: { action: "verify", request_id: "request-0001", otp: "1234" },
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("volunteer_confirm_delivery", expect.anything());
    expect(screen.queryByTestId("active-delivery-map")).not.toBeInTheDocument();
  });

  it("explains Edge Function network and preflight failures clearly", async () => {
    mocks.invoke.mockRejectedValueOnce(new Error("Failed to send a request to the Edge Function"));

    renderTaskPage();
    fireEvent.click(await screen.findByRole("button", { name: "Accept Task" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark Food Collected" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Four-digit NGO delivery code" }), { target: { value: "0042" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify delivery code" }));

    expect(await screen.findByText(/Check the function deployment, allowed browser origin, and network connection/)).toBeInTheDocument();
  });

  it("accepts only a four-digit OTP and does not display any generated code", async () => {
    renderTaskPage();
    fireEvent.click(await screen.findByRole("button", { name: "Accept Task" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark Food Collected" }));

    expect(screen.queryByText("1234")).not.toBeInTheDocument();
    const input = await screen.findByRole("textbox", { name: "Four-digit NGO delivery code" });
    fireEvent.change(input, { target: { value: "12345" } });
    expect(input).toHaveValue("1234");
    expect(screen.getByRole("button", { name: "Verify delivery code" })).toBeEnabled();
  });
});
