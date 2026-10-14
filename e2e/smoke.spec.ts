import { expect, test } from "@playwright/test";

/**
 * Smoke tests only.
 *
 * These hit the real pages, so the app needs a reachable Supabase to boot. The
 * public pages degrade gracefully when it is not, which is what they assert.
 */

test("home page renders the hero and the primary calls to action", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Laundry pickup and delivery",
  );
  await expect(
    page.getByRole("link", { name: "Book Now" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why UClean" })).toBeVisible();
});

test("services page renders", async ({ page }) => {
  await page.goto("/services");
  await expect(
    page.getByRole("heading", { name: "Services and prices" }),
  ).toBeVisible();
});

test("book page sends an anonymous visitor to sign in", async ({ page }) => {
  await page.goto("/book");

  await expect(
    page.getByRole("heading", { name: "Book a Pickup" }),
  ).toBeVisible();

  const cta = page.locator('a[href*="/auth/login"]');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute(
    "href",
    /\/auth\/login\?redirect=%2Faccount%2Fbook/,
  );
});

test("account redirects an anonymous visitor to sign in", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Faccount/);
});

test("admin redirects an anonymous visitor to sign in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fadmin/);
});

test("an unknown route renders the not found page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});

test("cron endpoints reject an unauthenticated caller", async ({ request }) => {
  const response = await request.get("/api/cron/notifications");
  // 401 when CRON_SECRET is set, 503 when it is not. Either way, never 200.
  expect([401, 503]).toContain(response.status());
});
