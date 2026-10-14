import { expect, test } from "@playwright/test";

/**
 * Horizontal overflow guards for the marketing pages.
 *
 * These assert the thing that is easiest to break and hardest to spot in
 * review: a grid or flex row whose fixed children sum to more than the space
 * available at a given width, which silently produces a sideways scroll. The
 * navbar once shipped a three-zone row at `md` that needed ~784px in the ~736px
 * available at 768px, so the widths below deliberately include that band.
 */

/**
 * Covers small phones through desktop, with extra weight on the breakpoints the
 * layout switches at: `sm` (640), `md` (768) and `lg` (1024).
 */
const VIEWPORTS = [320, 375, 390, 430, 640, 768, 834, 1024, 1280];

const ROUTES = ["/", "/pricing", "/pricing/regular", "/pricing/express"];

/** 1px of slack, since fractional layout widths can round up a hair. */
const TOLERANCE_PX = 1;

for (const route of ROUTES) {
  for (const width of VIEWPORTS) {
    test(`${route} does not scroll sideways at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(route);

      // Let images settle so their intrinsic width is accounted for.
      await page.waitForLoadState("networkidle");

      /*
       * `.reveal-up` sections sit at opacity 0 until a view timeline drives
       * them, so a clipped section would assert nothing meaningful. Neutralise
       * the animation so every section participates; it does not affect
       * `scrollWidth` either way.
       */
      await page.addStyleTag({
        content: ".reveal-up { animation: none !important; }",
      });

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );

      expect(
        overflow,
        `${route} overflows horizontally by ${overflow}px at ${width}px`,
      ).toBeLessThanOrEqual(TOLERANCE_PX);
    });
  }
}

test("the navbar switches to its compact row below lg", async ({ page }) => {
  // At 768px the logo, the pill nav and the three auth buttons together are too
  // wide, so the tablet gets the Book Now + hamburger row instead.
  await page.setViewportSize({ width: 768, height: 800 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 800 });

  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
});

test("landing page sections are not left invisible by the scroll reveal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/pricing/regular");

  /*
   * `.reveal-up` pins its `from` state (opacity 0) until a view timeline
   * advances it. Anything that does not drive the timeline - print, PDF export,
   * a full-page screenshot - therefore renders whole sections blank. Asserting
   * real, non-zero boxes for the page's headings is what catches that; a
   * `scrollWidth` check sails straight past it.
   */
  const headings = page.getByRole("heading");
  const count = await headings.count();
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const box = await headings.nth(index).boundingBox();
    const text = (await headings.nth(index).innerText()).trim();

    expect(box, `"${text}" has no layout box`).not.toBeNull();
    expect(box!.height, `"${text}" has zero height`).toBeGreaterThan(0);
    // A collapsed section would report a suspiciously small box.
    expect(
      box!.height,
      `"${text}" collapsed to ${box!.height}px`,
    ).toBeGreaterThan(8);
  }
});
