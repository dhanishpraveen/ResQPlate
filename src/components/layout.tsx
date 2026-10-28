import { useState, type ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  Menu,
  Sprout,
  X,
} from "lucide-react";
import { roleNavigation, type NavigationItem, type UserRole } from "./navigation";
import { Avatar, IconButton, StatusBadge } from "./ui";

export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`layout-page ${className}`.trim()}>{children}</main>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="layout-page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`layout-brand ${compact ? "layout-brand--compact" : ""}`}>
      <span className="layout-brand-symbol"><Sprout aria-hidden="true" size={19} /></span>
      <span>ResQPlate</span>
    </span>
  );
}

function Sidebar({
  items,
  role,
  activeLabel,
  open,
  onNavigate,
}: {
  items: NavigationItem[];
  role: UserRole;
  activeLabel?: string;
  open: boolean;
  onNavigate: () => void;
}) {
  return (
    <>
      {open && <button aria-label="Dismiss navigation overlay" className="layout-backdrop" onClick={onNavigate} type="button" />}
      <aside className={`layout-sidebar ${open ? "is-open" : ""}`} id="app-navigation">
        <div className="layout-sidebar-brand">
          <BrandMark />
          <IconButton className="layout-sidebar-close" label="Close navigation menu" onClick={onNavigate}>
            <X size={19} />
          </IconButton>
        </div>
        <nav aria-label={`${role} navigation`} className="layout-nav">
          {items.map(({ label, href, icon: Icon }) => (
            <a
              aria-current={label === activeLabel ? "page" : undefined}
              className={`layout-nav-link ${label === activeLabel ? "is-active" : ""} ${label === "Logout" ? "layout-nav-link--logout" : ""}`}
              href={href}
              key={label}
              onClick={(event) => {
                event.preventDefault();
                onNavigate();
              }}
            >
              <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Notifications" && <span aria-label="3 unread" className="layout-nav-count">3</span>}
            </a>
          ))}
        </nav>
        <p className="layout-sidebar-footnote">Food rescue. Shared impact.</p>
      </aside>
    </>
  );
}

function AppHeader({
  role,
  name,
  onMenu,
  menuOpen,
}: {
  role: UserRole;
  name: string;
  onMenu: () => void;
  menuOpen: boolean;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  return (
    <header className="layout-topbar">
      <div className="layout-topbar-leading">
        <IconButton
          aria-controls="app-navigation"
          aria-expanded={menuOpen}
          className="layout-menu-button"
          label={menuOpen ? "Close navigation" : "Open navigation"}
          onClick={onMenu}
        >
          <Menu size={21} />
        </IconButton>
        <span className="layout-topbar-context">Workspace <span aria-hidden="true">/</span> <strong>{role}</strong></span>
      </div>
      <div className="layout-topbar-actions">
        <IconButton className="layout-notification-button" label="Notifications, 3 unread">
          <Bell size={19} />
          <span aria-hidden="true" />
        </IconButton>
        <button
          aria-expanded={profileOpen}
          className="layout-profile-button"
          onClick={() => setProfileOpen(!profileOpen)}
          type="button"
        >
          <Avatar name={name} size="sm" />
          <span className="layout-profile-copy"><strong>{name}</strong><small>{role}</small></span>
          <ChevronDown aria-hidden="true" size={15} />
        </button>
        {profileOpen && (
          <div className="layout-profile-menu">
            <span className="layout-profile-menu-name">{name}</span>
            <StatusBadge tone="success">Verified</StatusBadge>
            <button onClick={() => setProfileOpen(false)} type="button">View profile</button>
            <button onClick={() => setProfileOpen(false)} type="button">Settings</button>
          </div>
        )}
      </div>
    </header>
  );
}

export function AppShell({
  role,
  items = roleNavigation[role],
  activeLabel = "Dashboard",
  userName = role === "donor" ? "Spice Garden" : role === "ngo" ? "Hope Care Foundation" : "Arun Kumar",
  children,
}: {
  role: UserRole;
  items?: NavigationItem[];
  activeLabel?: string;
  userName?: string;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="layout-app">
      <Sidebar
        activeLabel={activeLabel}
        items={items}
        onNavigate={() => setNavOpen(false)}
        open={navOpen}
        role={role}
      />
      <div className="layout-main">
        <AppHeader onMenu={() => setNavOpen(!navOpen)} menuOpen={navOpen} role={role} name={userName} />
        <PageContainer>{children}</PageContainer>
      </div>
    </div>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
  brandEyebrow = "Rescue food. Feed people. Reduce waste.",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  brandEyebrow?: string;
}) {
  return (
    <main className="layout-auth">
      <section aria-label="ResQPlate mission" className="layout-auth-brand">
        <BrandMark />
        <div className="layout-auth-message">
          <span className="layout-auth-kicker">Food rescue, made easier</span>
          <h1>Good food deserves<br />a good next stop.</h1>
          <p>{brandEyebrow}</p>
        </div>
        <div aria-label="Original reference illustration unavailable; placeholder shown" className="layout-art-placeholder" role="img">
          <div className="layout-art-circle layout-art-circle--one" />
          <div className="layout-art-circle layout-art-circle--two" />
          <Sprout aria-hidden="true" className="layout-art-sprout" size={74} strokeWidth={1.2} />
          <span className="layout-art-food">Original reference illustration unavailable</span>
        </div>
        <span className="layout-auth-foot">Together, we make every meal count.</span>
      </section>
      <section className="layout-auth-form-region">
        <div className="layout-auth-form">
          <div className="layout-auth-mobile-brand"><BrandMark compact /></div>
          <header className="layout-auth-heading">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </header>
          {children}
        </div>
      </section>
    </main>
  );
}

export function RoleNavigationPreview({
  role,
  onRoleChange,
}: {
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
}) {
  return (
    <label className="layout-role-preview">
      <span>Preview role navigation</span>
      <select value={role} onChange={(event) => onRoleChange(event.target.value as UserRole)}>
        <option value="donor">Donor</option>
        <option value="ngo">NGO</option>
        <option value="volunteer">Volunteer</option>
      </select>
    </label>
  );
}
