import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireAccount } from "./RouteGuards";
import { AuthProvider } from "./AuthContext";
import { ChooseRolePage } from "./pages";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  },
  supabaseConfigurationError: null,
}));

afterEach(cleanup);

const session = {
  access_token: "unit-test-token",
  refresh_token: "unit-test-refresh",
  token_type: "bearer",
  expires_in: 3600,
  user: {
    id: "orphan-user",
    app_metadata: { provider: "email", providers: ["email"] },
    aud: "authenticated",
    created_at: "2030-01-01T00:00:00Z",
    email: "ngo@example.test",
    is_anonymous: false,
    role: "authenticated",
    updated_at: "2030-01-01T00:00:00Z",
    user_metadata: {
      role: "ngo",
      full_name: "Test User",
      phone_number: "+14155552671",
    },
  },
} as Session;

const userProfile = {
  id: "orphan-user",
  role: "ngo",
  full_name: "Test User",
  phone_number: "+14155552671",
  address: null,
  about: null,
  avatar_path: null,
  profile_completed: true,
  created_at: "2030-01-01T00:00:00Z",
  updated_at: "2030-01-01T00:00:00Z",
};

const ngoProfile = {
  organization_name: null,
  organization_address: null,
  registration_number: null,
  organization_type: null,
  contact_name: null,
  contact_designation: null,
  contact_email: null,
  contact_phone: null,
};

let profileCreated = false;

function renderOnboarding() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/onboarding/role"]}>
        <Routes>
          <Route element={<RequireAccount />}>
            <Route element={<ChooseRolePage />} path="/onboarding/role" />
            <Route element={<p>Profile onboarding</p>} path="/onboarding/profile" />
            <Route element={<p>NGO organization details</p>} path="/onboarding/ngo/organization" />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("missing application profile recovery", () => {
  beforeEach(() => {
    profileCreated = false;
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mocks.rpc.mockImplementation(async () => {
      profileCreated = true;
      return { error: null };
    });
    mocks.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === "user_profiles") {
              return { data: profileCreated ? userProfile : null, error: null };
            }
            if (table === "ngo_profiles") return { data: ngoProfile, error: null };
            throw new Error(`Unexpected table: ${table}`);
          },
        }),
      }),
    }));
  });

  it("lets a signed-in orphan recover through the role RPC without a redirect loop", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    const ngoChoice = await screen.findByRole("radio", { name: /ngo/i });
    expect(ngoChoice).toBeChecked();
    expect(screen.queryByText("Account profile unavailable")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("NGO organization details")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("assign_initial_role", { p_role: "ngo" });
    await waitFor(() => expect(mocks.from).toHaveBeenCalledWith("ngo_profiles"));
  });

  it("shows role-assignment errors and keeps the user on role selection", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("Role assignment is unavailable.") });
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(await screen.findByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Role assignment is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Choose Your Role" })).toBeInTheDocument();
    expect(screen.queryByText("Profile onboarding")).not.toBeInTheDocument();
  });

  it("does not navigate when the RPC succeeds without making a profile readable", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(await screen.findByRole("button", { name: "Continue" }));

    expect(await screen.findByText(/role was assigned, but your application profile could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Choose Your Role" })).toBeInTheDocument();
    expect(screen.queryByText("Profile onboarding")).not.toBeInTheDocument();
  });
});
