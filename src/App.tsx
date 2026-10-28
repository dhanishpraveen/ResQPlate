import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAccount, HomeRoute } from "./auth/RouteGuards";
import {
  AuthCallbackPage,
  ChooseRolePage,
  DonorOnboardingPage,
  EmailSentPage,
  FuturePhasePage,
  LogoutPage,
  NgoOnboardingPage,
  ProfileOnboardingPage,
  ResetPasswordPage,
  SignInPage,
  SignUpPage,
  VerificationPendingPage,
} from "./auth/pages";
import {
  DonorDashboardPage,
  DonorImpactPage,
  DonationDetailsPage,
  DonationFormPage,
  MyDonationsPage,
  PickupRequestDetailsPage,
  PickupRequestsPage,
} from "./donor/pages";
import { AppShell, PageHeader } from "./components/layout";
import { Card } from "./components/ui";

function DonorPlaceholderPage({ label }: { label: string }) {
  return (
    <AppShell activeLabel={label} role="donor">
      <PageHeader description="This area is planned for a later ResQPlate phase." title={label} />
      <Card padding="lg"><p>{label} is not implemented in the donor phase yet. Donation management, pickup requests, and impact reporting are available from the sidebar.</p></Card>
    </AppShell>
  );
}

function NotFound() {
  return <Navigate replace to="/" />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<HomeRoute />} path="/" />
        <Route element={<SignInPage />} path="/sign-in" />
        <Route element={<SignUpPage />} path="/sign-up" />
        <Route element={<SignUpPage role="volunteer" />} path="/volunteer-sign-up" />
        <Route element={<EmailSentPage />} path="/email-sent" />
        <Route element={<LogoutPage />} path="/logout" />
        <Route element={<ResetPasswordPage />} path="/reset-password" />
        <Route element={<ResetPasswordPage update />} path="/reset-password/update" />
        <Route element={<AuthCallbackPage />} path="/auth/callback" />

        <Route element={<RequireAccount />}>
          <Route element={<ChooseRolePage />} path="/onboarding/role" />
          <Route element={<ProfileOnboardingPage />} path="/onboarding/profile" />
          <Route element={<RequireAccount role="donor" />}>
            <Route element={<DonorOnboardingPage />} path="/onboarding/donor" />
            <Route element={<DonorDashboardPage />} path="/donor" />
            <Route element={<DonationFormPage />} path="/donor/donations/new" />
            <Route element={<DonationFormPage />} path="/donor/donations/:donationId/edit" />
            <Route element={<DonationDetailsPage />} path="/donor/donations/:donationId" />
            <Route element={<MyDonationsPage />} path="/donor/donations" />
            <Route element={<PickupRequestsPage />} path="/donor/requests" />
            <Route element={<PickupRequestDetailsPage />} path="/donor/requests/:requestId" />
            <Route element={<DonorImpactPage />} path="/donor/impact" />
            <Route element={<DonorPlaceholderPage label="Messages" />} path="/donor/messages" />
            <Route element={<DonorPlaceholderPage label="Notifications" />} path="/donor/notifications" />
            <Route element={<DonorPlaceholderPage label="Profile" />} path="/donor/profile" />
            <Route element={<DonorPlaceholderPage label="Settings" />} path="/donor/settings" />
          </Route>
          <Route element={<RequireAccount role="ngo" />}>
            <Route element={<NgoOnboardingPage />} path="/onboarding/ngo/:step" />
            <Route element={<VerificationPendingPage />} path="/verification/pending" />
            <Route element={<FuturePhasePage role="ngo" />} path="/ngo" />
          </Route>
          <Route element={<RequireAccount role="volunteer" />}>
            <Route element={<FuturePhasePage role="volunteer" />} path="/volunteer" />
          </Route>
        </Route>

        <Route element={<NotFound />} path="*" />
      </Routes>
    </BrowserRouter>
  );
}
