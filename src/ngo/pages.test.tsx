import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AvailableDonationsPage, NgoDashboardPage, NgoDeliveryDetailsPage, NgoDonationDetailsPage, RequestPickupPage } from "./pages";
import type { NgoDonation } from "./data";
import { useAuth } from "../auth/AuthContext";
import {
  createPickupRequest,
  fetchActiveNgoRequest,
  fetchAvailableDonations,
  fetchDonation,
  fetchHandover,
  fetchNgoProfile,
  fetchNgoRequest,
  fetchNgoRequests,
  fetchRequestHistory,
} from "./data";
import { fetchSignedImages } from "../lib/storage";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../auth/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
  supabaseConfigurationError: null,
}));

vi.mock("../lib/storage", () => ({
  fetchSignedImages: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("./data", () => ({
  buildPickupRequestValues: (input: unknown) => input,
  fetchAvailableDonations: vi.fn(),
  createPickupRequest: vi.fn(),
  fetchActiveNgoRequest: vi.fn(),
  fetchDonation: vi.fn(),
  fetchHandover: vi.fn(),
  fetchNgoProfile: vi.fn(),
  fetchNgoRequest: vi.fn(),
  fetchNgoRequests: vi.fn(),
  fetchRequestHistory: vi.fn(),
  createNgoDocumentUrl: vi.fn(),
}));

afterEach(cleanup);

const donation = (overrides: Partial<NgoDonation> = {}): NgoDonation => ({
  id: "donation-1",
  food_name: "Seasonal vegetable boxes",
  cuisine_type: "Indian",
  description: "Fresh produce prepared today.",
  quantity: 24,
  unit: "servings",
  expires_at: "2026-10-30T12:00:00.000Z",
  status: "available",
  created_at: "2026-10-29T10:00:00.000Z",
  photo_path: null,
  ...overrides,
});

function renderRequestPickup() {
  return render(
    <MemoryRouter initialEntries={["/ngo/donations/donation-1/request"]}>
      <Routes>
        <Route element={<RequestPickupPage />} path="/ngo/donations/:donationId/request" />
        <Route element={<p>Request submitted</p>} path="/ngo/requests/:requestId/submitted" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NGO available donations screen", () => {
  beforeEach(() => {
    vi.mocked(fetchAvailableDonations).mockReset();
    vi.mocked(fetchNgoRequests).mockReset().mockResolvedValue([]);
    vi.mocked(fetchDonation).mockReset().mockResolvedValue(donation());
    vi.mocked(fetchNgoProfile).mockReset();
    vi.mocked(fetchActiveNgoRequest).mockReset().mockResolvedValue(null);
    vi.mocked(createPickupRequest).mockReset();
    vi.mocked(fetchSignedImages).mockReset().mockResolvedValue(new Map());
    vi.mocked(useAuth).mockReturnValue({
      session: {
        user: { id: "ngo-1", email: "ngo@example.org" },
      } as ReturnType<typeof useAuth>["session"],
      profile: null,
      roleOnboardingComplete: true,
      loading: false,
      profileError: null,
      refreshProfile: async () => true,
    });
    mocks.invoke.mockReset();
  });

  it("renders visible listings and filters them by search and cuisine", async () => {
    vi.mocked(fetchAvailableDonations).mockResolvedValue([
      donation(),
      donation({ id: "donation-2", food_name: "Bread loaves", cuisine_type: "Bakery" }),
    ]);

    render(<MemoryRouter><AvailableDonationsPage /></MemoryRouter>);

    expect(await screen.findByText("Seasonal vegetable boxes")).toBeInTheDocument();
    expect(screen.getByText("Bread loaves")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search donations" }), { target: { value: "vegetable" } });
    expect(screen.getByText("Seasonal vegetable boxes")).toBeInTheDocument();
    expect(screen.queryByText("Bread loaves")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search donations" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by cuisine" }), { target: { value: "Bakery" } });
    expect(screen.getByText("Bread loaves")).toBeInTheDocument();
    expect(screen.queryByText("Seasonal vegetable boxes")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchAvailableDonations).toHaveBeenCalledOnce());
  });

  it("renders a signed private-bucket photo when the listing includes one", async () => {
    vi.mocked(fetchSignedImages).mockResolvedValue(new Map([["donor-1/food.jpg", "https://signed.example/food.jpg"]]));
    vi.mocked(fetchAvailableDonations).mockResolvedValue([
      donation({ photo_path: "donor-1/food.jpg" }),
    ]);

    render(<MemoryRouter><AvailableDonationsPage /></MemoryRouter>);

    const image = await screen.findByRole("img", { name: "Seasonal vegetable boxes food photo" });
    expect(image).toHaveAttribute("src", "https://signed.example/food.jpg");
    fireEvent.error(image);
    expect(screen.getByRole("img", { name: "Seasonal vegetable boxes: food photo unavailable" })).toBeInTheDocument();
    expect(fetchSignedImages).toHaveBeenCalledWith(expect.anything(), "donation-images", ["donor-1/food.jpg"]);
  });

  it("renders the signed photo on donation details", async () => {
    vi.mocked(fetchDonation).mockResolvedValue(donation({ photo_path: "donor-1/food.jpg" }));
    vi.mocked(fetchSignedImages).mockResolvedValue(new Map([["donor-1/food.jpg", "https://signed.example/food.jpg"]]));

    render(
      <MemoryRouter initialEntries={["/ngo/donations/donation-1"]}>
        <Routes>
          <Route element={<NgoDonationDetailsPage />} path="/ngo/donations/:donationId" />
        </Routes>
      </MemoryRouter>,
    );

    const image = await screen.findByRole("img", { name: "Seasonal vegetable boxes food photo" });
    expect(image).toHaveAttribute("src", "https://signed.example/food.jpg");
  });

  it("keeps the details page usable when the photo path is missing or inaccessible", async () => {
    vi.mocked(fetchDonation).mockResolvedValue(donation({ photo_path: null }));

    const { unmount } = render(
      <MemoryRouter initialEntries={["/ngo/donations/donation-1"]}>
        <Routes>
          <Route element={<NgoDonationDetailsPage />} path="/ngo/donations/:donationId" />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText("Seasonal vegetable boxes: food photo unavailable")).toBeInTheDocument();
    unmount();

    vi.mocked(fetchDonation).mockResolvedValue(donation({ photo_path: "donor-1/missing.jpg" }));
    vi.mocked(fetchSignedImages).mockResolvedValue(new Map());
    render(
      <MemoryRouter initialEntries={["/ngo/donations/donation-1"]}>
        <Routes>
          <Route element={<NgoDonationDetailsPage />} path="/ngo/donations/:donationId" />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText("Seasonal vegetable boxes: food photo unavailable")).toBeInTheDocument();
  });

  it("explains when no donation rows are visible instead of implying a broken screen", async () => {
    vi.mocked(fetchAvailableDonations).mockResolvedValue([]);

    render(<MemoryRouter><AvailableDonationsPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "No visible donations" })).toBeInTheDocument();
    expect(screen.getByText(/active database access policy controls/i)).toBeInTheDocument();
  });

  it("refreshes available donations on demand", async () => {
    vi.mocked(fetchAvailableDonations)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([donation()]);

    render(<MemoryRouter><AvailableDonationsPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "No visible donations" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("Seasonal vegetable boxes")).toBeInTheDocument();
    expect(fetchAvailableDonations).toHaveBeenCalledTimes(2);
  });

  it("refreshes dashboard donation metrics and nearby listings on demand", async () => {
    vi.mocked(fetchAvailableDonations)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([donation()]);

    render(<MemoryRouter><NgoDashboardPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "No visible donations" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("Seasonal vegetable boxes")).toBeInTheDocument();
    expect(fetchAvailableDonations).toHaveBeenCalledTimes(2);
  });

  it("shows RPC authorization failures instead of presenting them as an empty listing", async () => {
    vi.mocked(fetchAvailableDonations).mockRejectedValueOnce(
      new Error("An authenticated NGO profile is required to browse available donations"),
    );

    render(<MemoryRouter><AvailableDonationsPage /></MemoryRouter>);

    expect(await screen.findByText("An authenticated NGO profile is required to browse available donations")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No visible donations" })).not.toBeInTheDocument();
  });

  it("shows the Request action on an available donation detail", async () => {
    render(
      <MemoryRouter initialEntries={["/ngo/donations/donation-1"]}>
        <Routes>
          <Route element={<NgoDonationDetailsPage />} path="/ngo/donations/:donationId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Request pickup" })).toHaveAttribute(
      "href",
      "/ngo/donations/donation-1/request",
    );
  });

  it("allows an NGO to request a donation without checking verification status", async () => {
    vi.mocked(fetchNgoProfile).mockImplementation(() => {
      throw new Error("Request flow must not load or require verification status.");
    });
    vi.mocked(createPickupRequest).mockResolvedValue({ id: "request-1" });
    renderRequestPickup();

    const pickupTime = new Date(Date.now() + 60 * 60 * 1000);
    pickupTime.setMinutes(pickupTime.getMinutes() - pickupTime.getTimezoneOffset());
    fireEvent.change(await screen.findByLabelText(/Preferred pickup date and time/), {
      target: { value: pickupTime.toISOString().slice(0, 16) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit pickup request" }));

    expect(await screen.findByText("Request submitted")).toBeInTheDocument();
    expect(fetchNgoProfile).not.toHaveBeenCalled();
    expect(fetchActiveNgoRequest).toHaveBeenCalledWith(expect.anything(), "ngo-1", "donation-1");
    expect(createPickupRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      donation_id: "donation-1",
      ngo_id: "ngo-1",
      requested_quantity: 24,
      notes: null,
    }));
  });

  it("routes an existing active request to the request list instead of inserting a duplicate", async () => {
    vi.mocked(fetchActiveNgoRequest).mockResolvedValue({ id: "request-existing" });
    renderRequestPickup();

    const pickupTime = new Date(Date.now() + 60 * 60 * 1000);
    pickupTime.setMinutes(pickupTime.getMinutes() - pickupTime.getTimezoneOffset());
    fireEvent.change(await screen.findByLabelText(/Preferred pickup date and time/), {
      target: { value: pickupTime.toISOString().slice(0, 16) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit pickup request" }));

    await waitFor(() => expect(fetchActiveNgoRequest).toHaveBeenCalledWith(expect.anything(), "ngo-1", "donation-1"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your organization already has an active request for this donation.");
    expect(screen.getByRole("link", { name: "Review your requests" })).toHaveAttribute("href", "/ngo/requests");
    expect(createPickupRequest).not.toHaveBeenCalled();
  });

  it("handles a concurrent duplicate request using the database unique constraint", async () => {
    vi.mocked(createPickupRequest).mockRejectedValue({
      code: "23505",
      message: "duplicate key value violates unique constraint \"pickup_requests_one_active_per_ngo\"",
    });
    renderRequestPickup();

    const pickupTime = new Date(Date.now() + 60 * 60 * 1000);
    pickupTime.setMinutes(pickupTime.getMinutes() - pickupTime.getTimezoneOffset());
    fireEvent.change(await screen.findByLabelText(/Preferred pickup date and time/), {
      target: { value: pickupTime.toISOString().slice(0, 16) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit pickup request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your organization already has an active request for this donation.");
    expect(screen.getByRole("link", { name: "Review your requests" })).toHaveAttribute("href", "/ngo/requests");
  });

  it("explains the database eligibility rejection without implying an active request", async () => {
    vi.mocked(createPickupRequest).mockRejectedValue({
      code: "P0001",
      message: "An NGO must request the full quantity of an available donation",
    });
    renderRequestPickup();

    const pickupTime = new Date(Date.now() + 60 * 60 * 1000);
    pickupTime.setMinutes(pickupTime.getMinutes() - pickupTime.getTimezoneOffset());
    fireEvent.change(await screen.findByLabelText(/Preferred pickup date and time/), {
      target: { value: pickupTime.toISOString().slice(0, 16) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit pickup request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/donation may no longer be available/i);
    expect(screen.queryByRole("link", { name: "Review your requests" })).not.toBeInTheDocument();
  });
});

describe("NGO in-app delivery verification", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      session: { user: { id: "ngo-1", email: "ngo@example.org" } } as ReturnType<typeof useAuth>["session"],
      profile: null,
      roleOnboardingComplete: true,
      loading: false,
      profileError: null,
      refreshProfile: async () => true,
    });
    vi.mocked(fetchNgoRequest).mockReset().mockResolvedValue({
      id: "request-otp-1",
      donation_id: "donation-1",
      ngo_id: "ngo-1",
      requested_quantity: 12,
      pickup_at: null,
      notes: null,
      status: "picked_up",
      received_quantity: null,
      receipt_confirmed_at: null,
      created_at: "2026-10-29T10:00:00.000Z",
      updated_at: "2026-10-29T10:00:00.000Z",
      volunteer_id: "volunteer-1",
      volunteer_picked_up_at: "2026-10-29T11:00:00.000Z",
      volunteer_delivered_at: null,
      delivery_verification_status: "pending",
      delivery_verified_at: null,
      delivery_issue_reason: null,
    } as never);
    vi.mocked(fetchHandover).mockReset().mockResolvedValue(null);
    vi.mocked(fetchRequestHistory).mockReset().mockResolvedValue([]);
    mocks.invoke.mockReset().mockResolvedValue({
      data: { ok: true, active: true, otp: "0072", expires_at: "2026-10-30T01:00:00.000Z" },
      error: null,
    });
  });

  it("retrieves and displays an active code only in the NGO delivery dashboard", async () => {
    render(
      <MemoryRouter initialEntries={["/ngo/deliveries/request-otp-1"]}>
        <Routes>
          <Route element={<NgoDeliveryDetailsPage />} path="/ngo/deliveries/:requestId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText("Active delivery code")).toHaveTextContent("0072");
    expect(mocks.invoke).toHaveBeenCalledWith("delivery-otp", {
      body: { action: "ngo_get", request_id: "request-otp-1" },
    });
    expect(screen.getByText(/Share it in person/)).toBeInTheDocument();
  });

  it("lets the NGO owner generate a new code through the trusted function", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { ok: true, active: false }, error: null });
    render(
      <MemoryRouter initialEntries={["/ngo/deliveries/request-otp-1"]}>
        <Routes>
          <Route element={<NgoDeliveryDetailsPage />} path="/ngo/deliveries/:requestId" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Generate delivery code" }));
    expect(await screen.findByLabelText("Active delivery code")).toHaveTextContent("0072");
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "delivery-otp", {
      body: { action: "ngo_issue", request_id: "request-otp-1" },
    });
  });
});
