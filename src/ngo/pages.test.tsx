import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AvailableDonationsPage, NgoDashboardPage } from "./pages";
import type { NgoDonation } from "./data";
import { useAuth } from "../auth/AuthContext";
import { fetchAvailableDonations, fetchNgoRequests } from "./data";
import { fetchSignedImages } from "../lib/storage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {},
  supabaseConfigurationError: null,
}));

vi.mock("../lib/storage", () => ({
  fetchSignedImages: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("./data", () => ({
  fetchAvailableDonations: vi.fn(),
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

describe("NGO available donations screen", () => {
  beforeEach(() => {
    vi.mocked(fetchAvailableDonations).mockReset();
    vi.mocked(fetchNgoRequests).mockReset().mockResolvedValue([]);
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
      new Error("A verified NGO account is required to browse available donations"),
    );

    render(<MemoryRouter><AvailableDonationsPage /></MemoryRouter>);

    expect(await screen.findByText("A verified NGO account is required to browse available donations")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No visible donations" })).not.toBeInTheDocument();
  });
});
