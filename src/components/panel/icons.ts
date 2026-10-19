import {
  Bell,
  CalendarClock,
  CalendarPlus,
  ClipboardList,
  DoorOpen,
  LayoutDashboard,
  PackageCheck,
  Receipt,
  Settings,
  Sparkles,
  TrendingUp,
  Truck,
  UserCog,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Route -> glyph for the panel sidebars.
 *
 * Keyed by href rather than declared on each nav item because the nav is spread
 * across three layouts in three route groups, including one this branch does
 * not own. Mapping here means those layouts stay the single source of truth for
 * labels and order, and adding a row to the sidebar does not also mean editing
 * a shared component's props. A route with no entry renders without an icon,
 * which is a normal state rather than an error.
 */
const PANEL_ICONS: Record<string, LucideIcon> = {
  // Staff
  "/staff": LayoutDashboard,
  "/staff/pickups": PackageCheck,
  "/staff/deliveries": Truck,
  "/staff/orders": ClipboardList,
  "/staff/bills": Receipt,
  "/staff/profile": UserRound,

  // Admin
  "/admin": LayoutDashboard,
  "/admin/sales": TrendingUp,
  "/admin/pickups": PackageCheck,
  "/admin/bookings": ClipboardList,
  // Still resolvable so the /admin/orders redirect keeps its breadcrumb label.
  "/admin/orders": ClipboardList,
  "/admin/deliveries": Truck,
  "/admin/walk-in": DoorOpen,
  "/admin/customers": Users,
  "/admin/agents": UserCog,
  "/admin/billing": Wallet,
  "/admin/notifications": Bell,
  "/admin/services": Sparkles,
  "/admin/slots": CalendarClock,
  "/admin/settings": Settings,
  "/admin/profile": UserRound,

  // Customer account
  "/account/book": CalendarPlus,
  "/account/orders": ClipboardList,
  "/account/profile": UserRound,
};

export function panelIcon(href: string): LucideIcon | undefined {
  return PANEL_ICONS[href];
}
