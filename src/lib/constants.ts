/**
 * Application constants.
 *
 * Values here are presentation defaults only. Anything that is a business
 * decision lives in the database, so an admin can change it without a deploy.
 */

/** Architecture doc section 7 lists nine slots split by the 2-3 PM break. */
export const BREAK_START_HOUR = 14;
export const BREAK_END_HOUR = 15;

export const ORDERING_PAGE_SIZE = 20;

/** Roles, mirroring the public.app_role enum. */
export const ROLES = ["customer", "staff", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PANEL_PREFIXES = {
  account: "/account",
  staff: "/staff",
  admin: "/admin",
} as const;
