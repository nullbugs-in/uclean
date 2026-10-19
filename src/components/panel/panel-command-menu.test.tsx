import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { PanelCommandMenu } from "./panel-command-menu";

/**
 * The Ctrl+K palette's global shortcut.
 *
 * The handler is on `window`, so it is handed every event of type "keydown" on
 * the page, not only the ones a person typed. Anything that dispatches one
 * synthetically - a browser extension, a devtool - sends an event with no `key`,
 * and reading `event.key.toLowerCase()` used to throw and take the whole panel
 * down with it.
 *
 * The three cases below are the whole contract: a real chord opens the palette,
 * a real other key does nothing, and a keyless event is ignored rather than
 * thrown on.
 */
const SECTIONS = [
  { title: "Today", items: [{ href: "/staff", label: "Overview" }] },
];

function menu() {
  return render(
    <PanelCommandMenu sections={SECTIONS} role="staff" panelName="Staff" />,
  );
}

describe("PanelCommandMenu shortcut", () => {
  it("opens on Ctrl+K", async () => {
    const user = userEvent.setup();
    menu();

    expect(
      screen.queryByPlaceholderText("Where do you want to go?"),
    ).toBeNull();

    await user.keyboard("{Control>}k{/Control}");

    expect(
      await screen.findByPlaceholderText("Where do you want to go?"),
    ).toBeInTheDocument();
  });

  it("opens on the macOS meta chord too", async () => {
    const user = userEvent.setup();
    menu();

    await user.keyboard("{Meta>}k{/Meta}");

    expect(
      await screen.findByPlaceholderText("Where do you want to go?"),
    ).toBeInTheDocument();
  });

  it("ignores a keydown with no key, instead of throwing", () => {
    menu();

    /*
     * The regression itself: a synthetic event carrying no `key`.
     *
     * Asserted through a `window` error listener rather than
     * `expect(() => dispatch()).not.toThrow()`, because an exception thrown
     * inside a DOM listener does not propagate out of `dispatchEvent` - jsdom
     * catches it and re-reports it as an unhandled window error. A `.toThrow()`
     * assertion passes with the bug present, which was verified by disabling
     * the guard and watching this test stay green.
     */
    const seen: Event[] = [];
    const onError = (event: Event) => seen.push(event);
    window.addEventListener("error", onError);

    try {
      window.dispatchEvent(new Event("keydown"));
    } finally {
      window.removeEventListener("error", onError);
    }

    expect(seen).toHaveLength(0);
  });

  it("leaves other keys alone", async () => {
    const user = userEvent.setup();
    menu();

    await user.keyboard("{Control>}j{/Control}");

    expect(
      screen.queryByPlaceholderText("Where do you want to go?"),
    ).toBeNull();
  });
});
