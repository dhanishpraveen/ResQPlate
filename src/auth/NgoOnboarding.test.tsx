import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireAccount } from "./RouteGuards";
import { NgoOnboardingPage, SignUpPage } from "./pages";
import { isNgoProfileComplete } from "./validation";

const mocks = vi.hoisted(() => ({
  authState: null as unknown,
  lastChanges: null as Record<string, unknown> | null,
  loadProfile: vi.fn(),
  persistedProfile: null as Record<string, unknown> | null,
  saveProfile: vi.fn(),
  selectedColumns: vi.fn(),
  signUp: vi.fn(),
  storageFrom: vi.fn(),
  update: vi.fn(),
}));

vi.mock("./AuthContext", () => ({
  useAuth: () => mocks.authState,
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "ngo_profiles") throw new Error(`Unexpected table: ${table}`);
      return {
        select: (columns: string) => {
          mocks.selectedColumns(columns);
          return { eq: () => ({ maybeSingle: mocks.loadProfile }) };
        },
        update: (changes: Record<string, unknown>) => {
          mocks.update(changes);
          mocks.lastChanges = changes;
          return {
            eq: () => ({
              select: (columns: string) => {
                mocks.selectedColumns(columns);
                return { maybeSingle: mocks.saveProfile };
              },
            }),
          };
        },
      };
    },
    storage: { from: mocks.storageFrom },
    auth: { signOut: vi.fn(), signUp: mocks.signUp },
    rpc: vi.fn(),
  },
  supabaseConfigurationError: null,
}));

afterEach(cleanup);

function renderNgoFlow(initialPath = "/onboarding/ngo/organization") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<RequireAccount role="ngo" />}>
          <Route element={<NgoOnboardingPage />} path="/onboarding/ngo/:step" />
          <Route element={<p>NGO dashboard</p>} path="/ngo" />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderNgoSignup() {
  return render(
    <MemoryRouter initialEntries={["/sign-up"]}>
      <Routes>
        <Route element={<SignUpPage />} path="/sign-up" />
        <Route element={<RequireAccount role="ngo" />}>
          <Route element={<NgoOnboardingPage />} path="/onboarding/ngo/:step" />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("NGO organization and contact registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.persistedProfile = {
      organization_name: null,
      organization_address: null,
      registration_number: null,
      organization_type: null,
      description: null,
      contact_name: null,
      contact_designation: null,
      contact_email: null,
      contact_phone: null,
    };
    mocks.loadProfile.mockImplementation(async () => ({ data: mocks.persistedProfile, error: null }));
    mocks.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    mocks.saveProfile.mockImplementation(async () => {
      mocks.persistedProfile = { ...mocks.persistedProfile, ...mocks.lastChanges };
      return { data: mocks.persistedProfile, error: null };
    });
    mocks.authState = {
      session: { user: { id: "ngo-user", email: "asha@example.org" } },
      profile: { role: "ngo", profile_completed: true, full_name: "Asha Kumar" },
      roleOnboardingComplete: false,
      loading: false,
      profileError: null,
      refreshProfile: vi.fn(async () => {
        const current = mocks.authState as Record<string, unknown>;
        mocks.authState = {
          ...current,
          roleOnboardingComplete: isNgoProfileComplete(mocks.persistedProfile),
        };
        return true;
      }),
    };
  });

  it("uses the existing NGO role provisioning flow and skips duplicate profile onboarding", async () => {
    renderNgoSignup();
    fireEvent.change(screen.getByRole("textbox", { name: "Full name" }), { target: { value: "Asha Kumar" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), { target: { value: "asha@example.org" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Phone number" }), { target: { value: "+14155552671" } });
    const passwordInput = document.querySelector('input[type="password"]');
    if (!passwordInput) throw new Error("Password input was not rendered.");
    fireEvent.change(passwordInput, { target: { value: "safe-password" } });
    fireEvent.click(screen.getByRole("radio", { name: /NGO/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(await screen.findByText(/Step 1 of 2.*Organization Details/)).toBeInTheDocument();
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        data: expect.objectContaining({ role: "ngo" }),
      }),
    }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("saves organization and contact details without uploads, opens the dashboard, and stays there after refresh", async () => {
    const view = renderNgoFlow();

    await screen.findByText(/Step 1 of 2.*Organization Details/);
    expect(view.container.querySelector('input[type="file"]')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Organization name" }), { target: { value: "Hope Foundation" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Organization type" }), { target: { value: "nonprofit" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Registration number" }), { target: { value: "NGO-2026-01" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Organization address" }), { target: { value: "12 Green Street" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Organization description (optional)" }), { target: { value: "Community meals" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByText(/Step 2 of 2.*Contact Person Details/);
    fireEvent.change(screen.getByRole("textbox", { name: "Contact person's name" }), { target: { value: "Asha Kumar" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Role / designation" }), { target: { value: "Coordinator" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Contact phone" }), { target: { value: "+14155552671" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete Registration" }));

    expect(await screen.findByText("NGO dashboard")).toBeInTheDocument();
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update.mock.calls[0][0]).toEqual({
      organization_name: "Hope Foundation",
      organization_address: "12 Green Street",
      registration_number: "NGO-2026-01",
      organization_type: "nonprofit",
      description: "Community meals",
    });
    expect(mocks.update.mock.calls[1][0]).toEqual({
      organization_name: "Hope Foundation",
      organization_address: "12 Green Street",
      registration_number: "NGO-2026-01",
      organization_type: "nonprofit",
      description: "Community meals",
      contact_name: "Asha Kumar",
      contact_designation: "Coordinator",
      contact_email: "asha@example.org",
      contact_phone: "+14155552671",
    });
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.selectedColumns.mock.calls.flat().join(" ")).not.toMatch(/registration_certificate_path|ngo_proof_path|onboarding_complete/);
    expect((mocks.authState as { refreshProfile: ReturnType<typeof vi.fn> }).refreshProfile).toHaveBeenCalledTimes(2);

    view.unmount();
    renderNgoFlow("/ngo");
    expect(await screen.findByText("NGO dashboard")).toBeInTheDocument();
  });

  it("persists the selected organization type from the submitted form values", async () => {
    renderNgoFlow();
    await screen.findByText(/Step 1 of 2.*Organization Details/);

    fireEvent.change(screen.getByRole("textbox", { name: "Organization name" }), { target: { value: "Hope Foundation" } });
    const typeSelect = screen.getByRole("combobox", { name: "Organization type" }) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: "nonprofit" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Registration number" }), { target: { value: "NGO-2026-01" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Organization address" }), { target: { value: "12 Green Street" } });
    typeSelect.value = "community";
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText(/Step 2 of 2.*Contact Person Details/)).toBeInTheDocument();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      organization_type: "community",
    }));
  });

  it("retains entered organization details and reports a zero-row update before allowing retry", async () => {
    mocks.saveProfile
      .mockResolvedValueOnce({ data: null, error: null })
      .mockImplementationOnce(async () => {
        mocks.persistedProfile = { ...mocks.persistedProfile, ...mocks.lastChanges };
        return { data: mocks.persistedProfile, error: null };
      });

    renderNgoFlow();
    await screen.findByText(/Step 1 of 2.*Organization Details/);
    const name = screen.getByRole("textbox", { name: "Organization name" });
    fireEvent.change(name, { target: { value: "Hope Foundation" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Organization type" }), { target: { value: "nonprofit" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Registration number" }), { target: { value: "NGO-2026-01" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Organization address" }), { target: { value: "12 Green Street" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText(/No organization profile row was updated/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Organization name" })).toHaveValue("Hope Foundation");
    expect(mocks.storageFrom).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText(/Step 2 of 2.*Contact Person Details/)).toBeInTheDocument();
  });

  it("reports database update errors without advancing", async () => {
    mocks.saveProfile.mockResolvedValueOnce({ data: null, error: new Error("Profile update denied") });
    renderNgoFlow();
    await screen.findByText(/Step 1 of 2.*Organization Details/);
    fireEvent.change(screen.getByRole("textbox", { name: "Organization name" }), { target: { value: "Hope Foundation" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Organization type" }), { target: { value: "nonprofit" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Registration number" }), { target: { value: "NGO-2026-01" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Organization address" }), { target: { value: "12 Green Street" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText(/Organization profile update failed: Profile update denied/)).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 2.*Organization Details/)).toBeInTheDocument();
  });

  it("stops at organization details when the saved row is missing an organization field", async () => {
    mocks.saveProfile.mockImplementationOnce(async () => ({
      data: {
        organization_name: "Hope Foundation",
        organization_address: "12 Green Street",
        registration_number: null,
        organization_type: "nonprofit",
        contact_name: null,
        contact_designation: null,
        contact_email: null,
        contact_phone: null,
      },
      error: null,
    }));

    renderNgoFlow();
    await screen.findByText(/Step 1 of 2.*Organization Details/);
    fireEvent.change(screen.getByRole("textbox", { name: "Organization name" }), { target: { value: "Hope Foundation" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Organization type" }), { target: { value: "nonprofit" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Registration number" }), { target: { value: "NGO-2026-01" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Organization address" }), { target: { value: "12 Green Street" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText(/did not save these required details: registration number/)).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 2.*Organization Details/)).toBeInTheDocument();
  });

  it("names required fields missing from the saved profile", async () => {
    mocks.saveProfile.mockImplementationOnce(async () => ({
      data: {
        organization_name: "Hope Foundation",
        organization_address: "12 Green Street",
        registration_number: null,
        organization_type: "nonprofit",
        contact_name: "Asha Kumar",
        contact_designation: "Coordinator",
        contact_email: "asha@example.org",
        contact_phone: "+14155552671",
      },
      error: null,
    }));

    renderNgoFlow("/onboarding/ngo/contact");
    await screen.findByText(/Step 2 of 2.*Contact Person Details/);
    fireEvent.change(screen.getByRole("textbox", { name: "Contact person's name" }), { target: { value: "Asha Kumar" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Role / designation" }), { target: { value: "Coordinator" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Contact phone" }), { target: { value: "+14155552671" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete Registration" }));

    expect(await screen.findByText(/missing: registration number/)).toBeInTheDocument();
  });
});
