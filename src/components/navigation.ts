import type { LucideIcon } from "lucide-react";
import {
  Bell,
  ClipboardList,
  Heart,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  PackagePlus,
  Settings,
  UserRound,
  Wallet,
  Warehouse,
  Bike,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";

export type UserRole = "donor" | "ngo" | "volunteer";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const roleNavigation: Record<UserRole, NavigationItem[]> = {
  donor: [
    { label: "Dashboard", href: "/donor", icon: LayoutDashboard },
    { label: "Create Donation", href: "/donor/donations/new", icon: PackagePlus },
    { label: "My Donations", href: "/donor/donations", icon: Warehouse },
    { label: "Pickup Requests", href: "/donor/requests", icon: ClipboardList },
    { label: "Impact", href: "/donor/impact", icon: Heart },
    { label: "Messages", href: "/donor/messages", icon: MessageCircle },
    { label: "Notifications", href: "/donor/notifications", icon: Bell },
    { label: "Profile", href: "/donor/profile", icon: UserRound },
    { label: "Settings", href: "/donor/settings", icon: Settings },
    { label: "Logout", href: "/logout", icon: LogOut },
  ],
  ngo: [
    { label: "Dashboard", href: "/ngo", icon: LayoutDashboard },
    { label: "Available Donations", href: "/ngo/donations", icon: Warehouse },
    { label: "My Requests", href: "/ngo/requests", icon: ClipboardList },
    { label: "My Deliveries", href: "/ngo/deliveries", icon: Bike },
    { label: "Delivery Verification", href: "/ngo/verification", icon: ShieldCheck },
    { label: "Impact", href: "/ngo/impact", icon: Heart },
    { label: "Messages", href: "/ngo/messages", icon: MessageCircle },
    { label: "Notifications", href: "/ngo/notifications", icon: Bell },
    { label: "Profile", href: "/ngo/profile", icon: UserRound },
    { label: "Settings", href: "/ngo/settings", icon: Settings },
    { label: "Logout", href: "/logout", icon: LogOut },
  ],
  volunteer: [
    { label: "Dashboard", href: "/volunteer", icon: LayoutDashboard },
    { label: "Available Tasks", href: "/volunteer/tasks/available", icon: ClipboardList },
    { label: "My Tasks", href: "/volunteer/tasks", icon: Bike },
    { label: "Earnings", href: "/volunteer/earnings", icon: Wallet },
    { label: "Impact", href: "/volunteer/impact", icon: Heart },
    { label: "Messages", href: "/volunteer/messages", icon: MessageCircle },
    { label: "Notifications", href: "/volunteer/notifications", icon: Bell },
    { label: "Profile", href: "/volunteer/profile", icon: UserRound },
    { label: "Availability", href: "/volunteer/availability", icon: CalendarDays },
    { label: "Settings", href: "/volunteer/settings", icon: Settings },
    { label: "Logout", href: "/logout", icon: LogOut },
  ],
};
