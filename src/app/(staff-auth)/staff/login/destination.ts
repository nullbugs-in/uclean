import type { AppRole } from "@/db/types";
import { PANEL_PREFIXES } from "@/lib/constants";

/** The only roles this sign-in page admits. Customers use phone OTP instead. */
export type PanelRole = Extract<AppRole, "staff" | "admin">;

const STAFF_LOGIN_PATH = "/staff/login";

const PANEL_PATHS: Record<PanelRole, readonly string[]> = {
  staff: [PANEL_PREFIXES.staff],
  admin: [PANEL_PREFIXES.admin, PANEL_PREFIXES.staff],
};

export function isPanelRole(
  role: AppRole | null | undefined,
): role is PanelRole {
  return role === "staff" || role === "admin";
}

/**
 * A `?redirect=` value is honoured only when it points into a panel this app
 * owns. Anything else — absolute URLs, protocol-relative `//evil.com`, the
 * login page itself — is dropped, so the parameter can never become an open
 * redirect.
 */
export function safeRedirectTarget(requested?: string): string | undefined {
  if (!requested || requested === STAFF_LOGIN_PATH) return undefined;

  const isPanelPath = Object.values(PANEL_PATHS)
    .flat()
    .some(
      (prefix) => requested === prefix || requested.startsWith(`${prefix}/`),
    );

  return isPanelPath ? requested : undefined;
}

/**
 * Where a signed-in staff/admin should land: the page they were headed for,
 * when that page is one their role may reach, otherwise their own panel.
 */
export function resolveDestination(
  role: PanelRole,
  requested?: string,
): string {
  const fallback =
    role === "admin" ? PANEL_PREFIXES.admin : PANEL_PREFIXES.staff;
  const target = safeRedirectTarget(requested);

  if (!target) return fallback;

  const allowed = PANEL_PATHS[role];
  const reachable = allowed.some(
    (prefix) => target === prefix || target.startsWith(`${prefix}/`),
  );

  return reachable ? target : fallback;
}
