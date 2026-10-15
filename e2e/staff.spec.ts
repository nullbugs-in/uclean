import { expect, test } from "@playwright/test";

/**
 * Staff panel smoke checks.
 *
 * These only assert structural behaviour (redirects and render) so they don't
 * depend on a live authenticated session. The app is already configured to
 * redirect anonymous staff/admin visitors to /staff/login with the correct
 * redirect query.
 */
test("staff overview redirects an anonymous visitor to sign in", async ({
  page,
}) => {
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/staff\/login\?redirect=%2Fstaff/);
});

test("staff login page renders", async ({ page }) => {
  await page.goto("/staff/login");
  await expect(page).toHaveURL(/\/staff\/login/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
