import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { DonationWriteValues } from "./data";
import { DonationFormPage, MyDonationsPage } from "./pages";
import { useAuth } from "../auth/AuthContext";

const mocks = vi.hoisted(() => ({
  auth: null as null | { session: unknown; profile: unknown },
  from: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrls: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    storage: {
      from: vi.fn(() => ({
        upload: mocks.upload,
        remove: mocks.remove,
        createSignedUrls: mocks.createSignedUrls,
      })),
    },
  },
  supabaseConfigurationError: null,
}));
vi.mock("../components/location-input", () => ({
  LocationInput: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: { address: string; latitude: number | null; longitude: number | null };
    onChange: (value: { address: string; latitude: number | null; longitude: number | null }) => void;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        onChange={(event) => onChange({ ...value, address: event.target.value })}
        value={value.address}
      />
    </label>
  ),
}));

let persistedDonations: Array<DonationWriteValues & {
  id: string;
  donor_id: string;
  created_at: string;
  updated_at: string;
}> = [];
let insertError: { code: string; message: string } | null = null;
let historyFetchCount = 0;
let insertPayloads: Array<Record<string, unknown>> = [];

function renderDonationRoutes() {
  return render(
    <MemoryRouter initialEntries={["/donor/donations/new"]}>
      <Routes>
        <Route element={<DonationFormPage />} path="/donor/donations/new" />
        <Route element={<MyDonationsPage />} path="/donor/donations" />
        <Route element={<p>Donation detail route</p>} path="/donor/donations/:donationId" />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillDonationForm() {
  fireEvent.change(screen.getByLabelText(/Food name/), { target: { value: "Biryani" } });
  fireEvent.change(screen.getByLabelText(/Cuisine type/), { target: { value: "Indian" } });
  fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "Fresh rice meal" } });
  fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText(/Available until \/ expiry/), {
    target: { value: localDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)) },
  });
  fireEvent.change(screen.getByLabelText("Pickup location"), { target: { value: "10 Market Street" } });
}

function localDateTime(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

describe("donor donation persistence", () => {
  beforeEach(() => {
    persistedDonations = [];
    insertError = null;
    historyFetchCount = 0;
    insertPayloads = [];
    mocks.from.mockReset().mockImplementation((table: string) => {
      if (table === "donations") {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertPayloads.push(payload);
            return {
              select: () => ({
                single: async () => {
                  if (insertError) return { data: null, error: insertError };
                  const row = {
                    ...payload,
                    id: "persisted-donation-id",
                    created_at: "2030-01-01T00:00:00.000Z",
                    updated_at: "2030-01-01T00:00:00.000Z",
                  } as DonationWriteValues & {
                    id: string;
                    donor_id: string;
                    created_at: string;
                    updated_at: string;
                  };
                  persistedDonations = [row, ...persistedDonations];
                  return { data: { id: row.id }, error: null };
                },
              }),
            };
          },
          select: (columns: string) => {
            if (columns === "*") historyFetchCount += 1;
            return {
              eq: () => ({
                order: async () => ({ data: persistedDonations, error: null }),
              }),
            };
          },
        };
      }
      if (table === "donor_pickup_request_details") {
        return {
          select: () => ({
            order: async () => ({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`Unexpected table access: ${table}`);
    });
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.upload.mockReset().mockResolvedValue({ error: null });
    mocks.remove.mockReset().mockResolvedValue({ error: null });
    mocks.createSignedUrls.mockReset().mockResolvedValue({ data: [], error: null });
    mocks.auth = {
      session: { user: { id: "authenticated-donor-id", email: "donor@example.org" } },
      profile: { id: "authenticated-donor-id", role: "donor", full_name: "Donor" },
    };
    vi.mocked(useAuth).mockImplementation(() => mocks.auth as ReturnType<typeof useAuth>);
  });

  afterEach(() => {
    cleanup();
  });

  it("only reports success after insert returns an ID and reloads history from the database", async () => {
    renderDonationRoutes();
    await fillDonationForm();
    fireEvent.click(screen.getByRole("button", { name: "Create Donation" }));

    expect(await screen.findByText("Donation published.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Biryani" })).toBeInTheDocument();
    expect(insertPayloads[0]).toMatchObject({
      donor_id: "authenticated-donor-id",
      food_name: "Biryani",
      status: "available",
    });
    expect(historyFetchCount).toBeGreaterThan(0);
    expect(mocks.from).toHaveBeenCalledWith("donations");
  });

  it("shows the insert error without navigation or a success state", async () => {
    insertError = { code: "42501", message: "new row violates row-level security policy" };
    renderDonationRoutes();
    await fillDonationForm();
    fireEvent.click(screen.getByRole("button", { name: "Create Donation" }));

    expect(await screen.findByText(/new row violates row-level security policy/i)).toBeInTheDocument();
    expect(screen.queryByText("Donation published.")).not.toBeInTheDocument();
    expect(screen.queryByText("No donations found")).not.toBeInTheDocument();
    expect(historyFetchCount).toBe(0);
  });

  it("stops safely when the authenticated donor profile ID is unavailable", async () => {
    mocks.auth = {
      session: { user: { id: "authenticated-donor-id", email: "donor@example.org" } },
      profile: null,
    };
    renderDonationRoutes();
    fireEvent.click(screen.getByRole("button", { name: "Create Donation" }));

    expect(await screen.findByText(/donor profile could not be verified/i)).toBeInTheDocument();
    expect(insertPayloads).toHaveLength(0);
    await waitFor(() => expect(mocks.from).not.toHaveBeenCalledWith("donations"));
  });
});
