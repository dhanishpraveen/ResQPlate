import { useState } from "react";
import {
  Heart,
  Leaf,
  PackageCheck,
  Utensils,
} from "lucide-react";
import { AppShell, AuthLayout, PageHeader, RoleNavigationPreview } from "./components/layout";
import { type UserRole } from "./components/navigation";
import {
  Button,
  Card,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  FoodListingCard,
  FormDemo,
  InlineAlert,
  LoadingState,
  ProgressTimeline,
  SectionHeading,
  StatCard,
  StatusBadge,
  SwitchToggle,
} from "./components/ui";

function AuthenticationPreview() {
  return (
    <AuthLayout
      subtitle="A shared authentication layout preview. No account is created."
      title="Welcome Back!"
    >
      <form className="preview-auth-form" onSubmit={(event) => event.preventDefault()}>
        <label className="ui-field">
          <span className="ui-label">Email address</span>
          <input className="ui-input" placeholder="you@example.com" type="email" />
        </label>
        <label className="ui-field">
          <span className="ui-label">Password</span>
          <input className="ui-input" placeholder="Enter your password" type="password" />
        </label>
        <a className="preview-forgot-link" href="#forgot-password" onClick={(event) => event.preventDefault()}>
          Forgot password?
        </a>
        <Button className="preview-auth-submit" type="submit">Sign In</Button>
        <p className="preview-auth-note">This design-system preview does not authenticate users.</p>
      </form>
    </AuthLayout>
  );
}

function DesignSystemShowcase({
  role,
  onRoleChange,
  onOpenDialog,
  onShowAuth,
}: {
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
  onOpenDialog: () => void;
  onShowAuth: () => void;
}) {
  const [updatesEnabled, setUpdatesEnabled] = useState(true);

  return (
    <AppShell activeLabel="Dashboard" role={role}>
      <PageHeader
        action={<RoleNavigationPreview onRoleChange={onRoleChange} role={role} />}
        description="A component and layout preview based on the approved reference; it is not an application dashboard."
        title="Shared UI preview"
      />

      <div className="preview-stack">
        <InlineAlert tone="info" title="Phase 1 design system">
          Controls below demonstrate shared styling and accessible patterns only. No business actions are connected.
        </InlineAlert>

        <section className="preview-section">
          <SectionHeading
            description="Compact summaries mirror the metric cards visible across role dashboards."
            title="Statistic cards"
          />
          <div className="preview-stat-grid">
            <StatCard detail="Across completed donations" icon={<PackageCheck size={19} />} label="Meals donated" value="42" />
            <StatCard detail="This month" icon={<Leaf size={19} />} label="Food rescued" tone="mint" value="186 kg" />
            <StatCard detail="Community impact" icon={<Heart size={19} />} label="People fed" tone="amber" value="128" />
            <StatCard detail="Illustrative data only" icon={<Utensils size={19} />} label="Active listings" tone="blue" value="08" />
          </div>
        </section>

        <section className="preview-two-col">
          <Card padding="lg">
            <div className="preview-section-heading">
              <SectionHeading description="Shared controls, status treatments, and card rhythm." title="Actions and status" />
            </div>
            <div className="preview-button-row">
              <Button icon={<PackageCheck size={16} />}>Primary action</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outlined</Button>
              <Button variant="danger">Destructive</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="preview-badge-row" aria-label="Example status badges">
              <StatusBadge tone="success">Completed</StatusBadge>
              <StatusBadge tone="warning">Pending</StatusBadge>
              <StatusBadge tone="info">In progress</StatusBadge>
              <StatusBadge tone="danger">Declined</StatusBadge>
              <StatusBadge>Draft</StatusBadge>
            </div>
            <SwitchToggle
              checked={updatesEnabled}
              description="Interactive preview control; no preference is saved."
              label="Notification preference"
              onChange={setUpdatesEnabled}
            />
            <div className="preview-dialog-action">
              <Button onClick={onOpenDialog} variant="outline">Preview confirmation dialog</Button>
              <Button onClick={onShowAuth} variant="ghost">Preview authentication layout</Button>
            </div>
          </Card>

          <Card padding="lg">
            <SectionHeading description="Shared donation and delivery progress patterns." title="Food and progress" />
            <div className="preview-food">
              <FoodListingCard
                category="Prepared meals"
                name="Vegetable rice bowls"
                pickupWindow="Today, 4:00–5:00 PM"
                quantity="24 portions"
                status="Available"
              />
            </div>
            <ProgressTimeline
              steps={[
                { label: "Request approved", detail: "Pickup details confirmed", state: "complete" },
                { label: "Food collected", detail: "Volunteer is on the way", state: "current" },
                { label: "Receipt confirmed", state: "upcoming" },
              ]}
            />
          </Card>
        </section>

        <section className="preview-section">
          <SectionHeading
            description="Fields use associated labels, visible focus, and validation message patterns."
            title="Form elements"
          />
          <Card padding="lg"><FormDemo /></Card>
        </section>

        <section className="preview-state-grid">
          <Card padding="sm">
            <EmptyState description="Try adjusting your filters or check back later." title="No donations yet" />
          </Card>
          <Card padding="sm"><LoadingState label="Loading deliveries" /></Card>
          <Card padding="sm">
            <ErrorState description="This is an example of a visible, recoverable error state." onRetry={() => undefined} />
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

export function App() {
  const [role, setRole] = useState<UserRole>("donor");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [authPreview, setAuthPreview] = useState(false);

  return (
    <>
      {authPreview ? (
        <div className="preview-auth-frame">
          <Button className="preview-return-button" onClick={() => setAuthPreview(false)} variant="outline">
            Return to component preview
          </Button>
          <AuthenticationPreview />
        </div>
      ) : (
        <DesignSystemShowcase
          onOpenDialog={() => setDialogOpen(true)}
          onRoleChange={setRole}
          onShowAuth={() => setAuthPreview(true)}
          role={role}
        />
      )}
      <ConfirmationDialog
        cancelLabel="Cancel"
        confirmLabel="Continue"
        description="This dialog preview demonstrates the shared confirmation pattern. Nothing will be changed."
        onClose={() => setDialogOpen(false)}
        onConfirm={() => setDialogOpen(false)}
        open={dialogOpen}
        title="Continue with this action?"
      />
    </>
  );
}
