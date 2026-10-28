import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { RequireAccount } from "./RouteGuards";
import { useAuth } from "./AuthContext";

vi.mock("./AuthContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./AuthContext")>();
  return { ...actual, useAuth: vi.fn() };
});

const session = {
  access_token: "unit-test-token",
  refresh_token: "unit-test-refresh",
  token_type: "bearer",
  expires_in: 3600,
  user: { id: "test-user" },
} as Session;

const profile: Database["public"]["Tables"]["user_profiles"]["Row"] = {
  id: "test-user",
  role: "donor",
  full_name: "Test Donor",
  phone_number: "+14155552671",
  address: "Test address",
  about: null,
  avatar_path: null,
  profile_completed: true,
  created_at: "2030-01-01T00:00:00Z",
  updated_at: "2030-01-01T00:00:00Z",
};

function renderProtected(role: "donor" | "ngo" | "volunteer", initialPath = "/protected") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<p>Sign-in page</p>} path="/sign-in" />
        <Route element={<p>Profile onboarding</p>} path="/onboarding/profile" />
        <Route element={<p>Donor destination</p>} path="/donor" />
        <Route element={<RequireAccount role={role} />}>
          <Route element={<p>Protected content</p>} path="/protected" />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("role-aware route protection", () => {
  const authState = (overrides: Partial<ReturnType<typeof useAuth>> = {}): ReturnType<typeof useAuth> => ({
    session,
    profile,
    roleOnboardingComplete: true,
    ngoVerificationStatus: "verified",
    loading: false,
    profileError: null,
    refreshProfile: async () => undefined,
    ...overrides,
  });

  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(authState({ session: null, profile: null }));
  });

  it("redirects unauthenticated users to sign-in", async () => {
    renderProtected("ngo");
    expect(await screen.findByText("Sign-in page")).toBeInTheDocument();
  });

  it("redirects a user away from a route for another role", async () => {
    vi.mocked(useAuth).mockReturnValue(authState());
    renderProtected("ngo", "/protected");
    expect(await screen.findByText("Donor destination")).toBeInTheDocument();
  });

  it("requires basic profile onboarding before protected content", async () => {
    vi.mocked(useAuth).mockReturnValue(authState({
      profile: { ...profile, profile_completed: false },
    }));
    renderProtected("donor", "/protected");
    expect(await screen.findByText("Profile onboarding")).toBeInTheDocument();
  });

  it("renders a protected route for the matching authenticated role", async () => {
    vi.mocked(useAuth).mockReturnValue(authState({ profile: { ...profile, role: "ngo" } }));
    renderProtected("ngo", "/protected");
    expect(await screen.findByText("Protected content")).toBeInTheDocument();
  });
});
