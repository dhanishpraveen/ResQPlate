import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthLayout } from "../components/layout";
import { InlineAlert, LoadingState } from "../components/ui";
import type { UserRole } from "../components/navigation";
import { roleHome, useAuth } from "./AuthContext";

function nextOnboardingPath(role: UserRole | null) {
  if (!role) return "/onboarding/role";
  if (role === "donor") return "/onboarding/donor";
  if (role === "ngo") return "/onboarding/ngo/organization";
  return "/volunteer";
}

export function HomeRoute() {
  const { session, profile, loading, profileError } = useAuth();
  if (loading) return <AuthLayout title="Opening ResQPlate"><LoadingState label="Restoring your secure session" /></AuthLayout>;
  if (!session) return <Navigate replace to="/sign-in" />;
  if (profileError) {
    return (
      <AuthLayout title="Account profile unavailable">
        <InlineAlert tone="danger" title="Unable to load your profile">{profileError}</InlineAlert>
      </AuthLayout>
    );
  }
  if (!profile?.role) return <Navigate replace to="/onboarding/role" />;
  if (!profile.profile_completed) return <Navigate replace to="/onboarding/profile" />;
  if (profile.role === "donor" || profile.role === "ngo" || profile.role === "volunteer") {
    return <Navigate replace to={roleHome(profile.role)} />;
  }
  return <Navigate replace to="/onboarding/role" />;
}

export function RequireAccount({ role }: { role?: UserRole }) {
  const { session, profile, loading, profileError, roleOnboardingComplete, ngoVerificationStatus } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLayout title="Opening ResQPlate"><LoadingState label="Loading your account and permissions" /></AuthLayout>;
  if (!session) return <Navigate replace state={{ from: location }} to="/sign-in" />;
  if (profileError) {
    return (
      <AuthLayout title="Account profile unavailable">
        <InlineAlert tone="danger" title="Unable to load your profile">{profileError}</InlineAlert>
      </AuthLayout>
    );
  }

  const path = location.pathname;
  if (!profile?.role) {
    return path === "/onboarding/role" ? <Outlet /> : <Navigate replace to="/onboarding/role" />;
  }
  if (!profile.profile_completed) {
    return path === "/onboarding/profile" ? <Outlet /> : <Navigate replace to="/onboarding/profile" />;
  }
  if (path === "/onboarding/role") return <Navigate replace to={nextOnboardingPath(profile.role)} />;
  if (path === "/onboarding/profile") {
    return <Navigate replace to={nextOnboardingPath(profile.role)} />;
  }

  if (profile.role === "donor" && roleOnboardingComplete === false && path !== "/onboarding/donor") {
    return <Navigate replace to="/onboarding/donor" />;
  }
  if (profile.role === "ngo" && roleOnboardingComplete === false && !path.startsWith("/onboarding/ngo")) {
    return <Navigate replace to="/onboarding/ngo/organization" />;
  }
  if (profile.role === "ngo" && roleOnboardingComplete === true && ngoVerificationStatus !== "verified" && path !== "/verification/pending" && !path.startsWith("/onboarding/ngo")) {
    return <Navigate replace to="/verification/pending" />;
  }
  if (profile.role === "donor" && roleOnboardingComplete === true && path === "/onboarding/donor") {
    return <Navigate replace to={roleHome(profile.role)} />;
  }
  if (profile.role === "ngo" && roleOnboardingComplete === true && ngoVerificationStatus === "verified" && path === "/verification/pending") {
    return <Navigate replace to={roleHome(profile.role)} />;
  }

  if (role && profile.role !== role) return <Navigate replace to={roleHome(profile.role)} />;
  return <Outlet />;
}
