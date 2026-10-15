import { redirect } from "next/navigation";

/**
 * The customer dashboard was removed: a booking now confirms on the site and
 * sends the customer home.
 *
 * The route is kept as a redirect rather than deleted because six places still
 * point here as the default landing after sign-in: the middleware bounce off
 * /auth/* (src/proxy.ts) and the `redirectTo` default on the login, sign-up and
 * verify pages. Removing it outright would leave every successful sign-in on a
 * 404. Nothing renders here; it forwards to the home page.
 */
export default function AccountRedirectPage() {
  redirect("/");
}
