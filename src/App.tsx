import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAccount, HomeRoute } from "./auth/RouteGuards";
import {
  AuthCallbackPage,
  ChooseRolePage,
  DonorOnboardingPage,
  EmailSentPage,
  LogoutPage,
  NgoOnboardingPage,
  ProfileOnboardingPage,
  ResetPasswordPage,
  SignInPage,
  SignUpPage,
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
import {
  AvailableDonationsPage,
  ConfirmNgoReceiptPage,
  NgoDashboardPage,
  NgoDeliveryDetailsPage,
  NgoDeliveriesPage,
  NgoDonationDetailsPage,
  NgoImpactPage,
  NgoProfilePage,
  NgoRequestsPage,
  NgoSettingsPage,
  NgoUnavailableFeaturePage,
  ReceiptConfirmedPage,
  RequestPickupPage,
  RequestSubmittedPage,
} from "./ngo/pages";
import { AppShell, PageHeader } from "./components/layout";
import { Card } from "./components/ui";
import {
  VolunteerAvailableTasksPage,
  VolunteerDashboardPage,
  VolunteerMyTasksPage,
  VolunteerTaskDetailsPage,
  VolunteerUnavailablePage,
} from "./volunteer/pages";

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
            <Route element={<NgoDashboardPage />} path="/ngo" />
            <Route element={<AvailableDonationsPage />} path="/ngo/donations" />
            <Route element={<RequestPickupPage />} path="/ngo/donations/:donationId/request" />
            <Route element={<NgoDonationDetailsPage />} path="/ngo/donations/:donationId" />
            <Route element={<NgoRequestsPage />} path="/ngo/requests" />
            <Route element={<RequestSubmittedPage />} path="/ngo/requests/:requestId/submitted" />
            <Route element={<NgoDeliveryDetailsPage />} path="/ngo/requests/:requestId" />
            <Route element={<NgoDeliveriesPage />} path="/ngo/deliveries" />
            <Route element={<NgoDeliveriesPage />} path="/ngo/verification" />
            <Route element={<NgoDeliveryDetailsPage />} path="/ngo/deliveries/:requestId" />
            <Route element={<ConfirmNgoReceiptPage />} path="/ngo/deliveries/:requestId/receipt" />
            <Route element={<ReceiptConfirmedPage />} path="/ngo/deliveries/:requestId/receipt/confirmed" />
            <Route element={<NgoImpactPage />} path="/ngo/impact" />
            <Route element={<NgoUnavailableFeaturePage feature="Messages" />} path="/ngo/messages" />
            <Route element={<NgoUnavailableFeaturePage feature="Notifications" />} path="/ngo/notifications" />
            <Route element={<NgoProfilePage />} path="/ngo/profile" />
            <Route element={<NgoSettingsPage />} path="/ngo/settings" />
          </Route>
          <Route element={<RequireAccount role="volunteer" />}>
            <Route element={<VolunteerDashboardPage />} path="/volunteer" />
            <Route element={<VolunteerAvailableTasksPage />} path="/volunteer/tasks/available" />
            <Route element={<VolunteerMyTasksPage />} path="/volunteer/tasks" />
            <Route element={<VolunteerTaskDetailsPage />} path="/volunteer/tasks/:requestId" />
            <Route element={<VolunteerUnavailablePage feature="Earnings" />} path="/volunteer/earnings" />
            <Route element={<VolunteerUnavailablePage feature="Impact" />} path="/volunteer/impact" />
            <Route element={<VolunteerUnavailablePage feature="Messages" />} path="/volunteer/messages" />
            <Route element={<VolunteerUnavailablePage feature="Notifications" />} path="/volunteer/notifications" />
            <Route element={<VolunteerUnavailablePage feature="Profile" />} path="/volunteer/profile" />
            <Route element={<VolunteerUnavailablePage feature="Availability" />} path="/volunteer/availability" />
            <Route element={<VolunteerUnavailablePage feature="Settings" />} path="/volunteer/settings" />
          </Route>
        </Route>

        <Route element={<NotFound />} path="*" />
      </Routes>
    </BrowserRouter>
  );
}
