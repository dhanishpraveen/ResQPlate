import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { UserRole } from "../components/navigation";
import type { Database } from "../lib/database.types";
import { supabase } from "../lib/supabase";
import { isNgoProfileComplete } from "./validation";

type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  roleOnboardingComplete: boolean | null;
  loading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<boolean>;
}

const AuthContext = createContext<AuthState | null>(null);

function describeProfileError(message: string) {
  if (message.includes("user_profiles") || message.includes("schema cache")) {
    return "The ResQPlate profile schema is unavailable. Apply the reviewed Supabase migration to the development project.";
  }
  return `Could not load your ResQPlate profile: ${message}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roleOnboardingComplete, setRoleOnboardingComplete] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const profileUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string): Promise<boolean> => {
    const sequence = ++loadSequence.current;
    setProfileError(null);
    if (profileUserId.current !== userId) {
      profileUserId.current = null;
      setProfile(null);
      setRoleOnboardingComplete(null);
    }

    if (!supabase) {
      setProfileError("Supabase is not configured.");
      return false;
    }

    try {
      const { data: userProfile, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      if (!userProfile) {
        if (sequence !== loadSequence.current) return false;
        profileUserId.current = userId;
        setProfile(null);
        setRoleOnboardingComplete(null);
        return false;
      }

      let onboardingComplete: boolean | null = null;
      if (userProfile.role === "donor") {
        const result = await supabase
          .from("donor_profiles")
          .select("onboarding_complete")
          .eq("id", userId)
          .maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) throw new Error("Donor profile record was not found for this account.");
        onboardingComplete = result.data.onboarding_complete;
      } else if (userProfile.role === "ngo") {
        const result = await supabase
          .from("ngo_profiles")
          .select("organization_name, organization_address, registration_number, organization_type, contact_name, contact_designation, contact_email, contact_phone")
          .eq("id", userId)
          .maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) throw new Error("NGO profile record was not found for this account.");
        onboardingComplete = isNgoProfileComplete(result.data);
      } else if (userProfile.role === "volunteer") {
        const result = await supabase
          .from("volunteer_profiles")
          .select("onboarding_complete")
          .eq("id", userId)
          .maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) throw new Error("Volunteer profile record was not found for this account.");
        onboardingComplete = result.data.onboarding_complete;
      }

      if (sequence !== loadSequence.current) return false;
      profileUserId.current = userId;
      setProfile(userProfile);
      setRoleOnboardingComplete(onboardingComplete);
      return true;
    } catch (error) {
      if (sequence !== loadSequence.current) return false;
      setProfileError(describeProfileError(error instanceof Error ? error.message : String(error)));
      return false;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) return false;
    return loadProfile(session.user.id);
  }, [loadProfile, session?.user.id]);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;

    if (!supabase) {
      setLoading(false);
      return () => { active = false; };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true;
      setSession(nextSession);
      setLoading(Boolean(nextSession));
      if (!nextSession) {
        loadSequence.current += 1;
        profileUserId.current = null;
        setProfile(null);
        setRoleOnboardingComplete(null);
        setProfileError(null);
        setLoading(false);
        return;
      }
      window.setTimeout(() => {
        if (active) {
          void loadProfile(nextSession.user.id).finally(() => {
            if (active) setLoading(false);
          });
        }
      }, 0);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return;
      if (error) {
        setProfileError(`Could not restore the Supabase session: ${error.message}`);
        setLoading(false);
        return;
      }
      setSession(data.session);
      if (data.session) {
        void loadProfile(data.session.user.id).finally(() => {
          if (active) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch((error: unknown) => {
      if (!active) return;
      setProfileError(`Could not restore the Supabase session: ${error instanceof Error ? error.message : String(error)}`);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo(() => ({
    session,
    profile,
    roleOnboardingComplete,
    loading,
    profileError,
    refreshProfile,
  }), [session, profile, roleOnboardingComplete, loading, profileError, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error("useAuth must be used inside AuthProvider");
  return state;
}

export function roleHome(role: UserRole) {
  return `/${role}`;
}
