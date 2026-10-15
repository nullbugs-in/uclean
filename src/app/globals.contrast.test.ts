import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards the contrast floors in globals.css.
 *
 * The palette shipped two failures that are invisible in normal use and easy to
 * reintroduce: form-field borders at 1.3:1 (the field is borderless, so that
 * border is the only thing identifying the control) and a focus ring at 2.5:1.
 * Both sit far below WCAG's 3:1 for non-text contrast, and neither is obvious
 * from reading the tokens. Asserting the computed ratio is what keeps them
 * fixed.
 *
 * Values are read from the stylesheet rather than copied here, so editing a
 * token is what changes the test.
 */

// Vitest runs from the project root, and `import.meta.url` is not a file URL
// under the jsdom environment, so resolve against the working directory.
const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** WCAG 1.4.3: body text. */
const TEXT = 4.5;
/** WCAG 1.4.11 / 2.4.11: control boundaries and focus indicators. */
const UI = 3;

/** Custom properties of one selector block, with the leading `--` stripped. */
function tokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  const body = match?.[1];
  if (body === undefined) {
    throw new Error(`No "${selector}" block in globals.css`);
  }

  const found: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const declaration = line.match(/^\s*--([\w-]+)\s*:\s*(.+?);\s*$/);
    const name = declaration?.[1];
    const raw = declaration?.[2];
    if (name !== undefined && raw !== undefined) found[name] = raw;
  }
  return found;
}

/** Indexed read that fails loudly instead of yielding undefined. */
function value(palette: Record<string, string>, key: string): string {
  const found = palette[key];
  if (found === undefined) throw new Error(`Token "--${key}" is missing`);
  return found;
}

/**
 * OKLCH -> linear sRGB. Those linear channels are already the space WCAG's
 * relative-luminance formula expects, so no transfer function is applied before
 * weighting them; the sRGB encode is only for readable hex in failure output.
 */
function parse(value: string) {
  const match = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i);
  if (!match) {
    throw new Error(
      `Unsupported colour "${value}". This test only understands oklch(); ` +
        `convert a new token rather than loosening the check.`,
    );
  }

  const [l = 0, chroma = 0, hue = 0] = match.slice(1).map(Number);
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map((channel) => Math.min(1, Math.max(0, channel)));

  const [r = 0, g = 0, blue = 0] = linear;
  const hex =
    "#" +
    linear
      .map((channel) => {
        const srgb =
          channel <= 0.0031308
            ? 12.92 * channel
            : 1.055 * channel ** (1 / 2.4) - 0.055;
        return Math.round(srgb * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("");

  return { hex, luminance: 0.2126 * r + 0.7152 * g + 0.0722 * blue };
}

function contrast(palette: Record<string, string>, fg: string, bg: string) {
  const a = parse(value(palette, fg)).luminance;
  const b = parse(value(palette, bg)).luminance;
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, minimum, what the pair is for] */
const REQUIREMENTS: Array<[string, string, number, string]> = [
  ["foreground", "background", TEXT, "body text on the page"],
  ["foreground", "card", TEXT, "body text on a card"],
  ["card-foreground", "card", TEXT, "card text"],
  ["muted-foreground", "background", TEXT, "secondary text"],
  ["muted-foreground", "card", TEXT, "secondary text on a card"],
  ["primary-foreground", "primary", TEXT, "label on the primary button"],
  ["accent-foreground", "accent", TEXT, "label on a hover surface"],
  ["sidebar-foreground", "sidebar", TEXT, "sidebar labels"],
  ["sidebar-accent-foreground", "sidebar-accent", TEXT, "active sidebar item"],
  ["input", "card", UI, "form-field border"],
  ["input", "background", UI, "form-field border"],
  ["ring", "background", UI, "focus ring on the page"],
  ["ring", "card", UI, "focus ring on a card"],
];

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s theme", (theme, selector) => {
  const palette = tokens(selector);

  it.each(REQUIREMENTS)(
    "%s on %s meets %s:1 (%s)",
    (foreground, background, minimum, purpose) => {
      const actual = contrast(palette, foreground, background);
      const detail = `${theme}: ${foreground} on ${background} for ${purpose} — ${parse(value(palette, foreground)).hex} on ${parse(value(palette, background)).hex} = ${actual.toFixed(2)}:1`;

      expect(actual, detail).toBeGreaterThanOrEqual(minimum);
    },
  );

  it("keeps the five chart colours distinct", () => {
    const series = [1, 2, 3, 4, 5].map((n) => value(palette, `chart-${n}`));

    const hexes = series.map((colour) => parse(colour).hex);
    expect(new Set(hexes).size, `duplicate chart colour in ${theme}`).toBe(
      hexes.length,
    );
  });
});

describe("token intent", () => {
  it("keeps the field border darker than the decorative border", () => {
    const palette = tokens(":root");

    // --border may stay light; --input may not. Collapsing the two into one
    // value is exactly the bug this file exists to prevent, so assert the
    // relationship rather than only the numbers.
    expect(parse(value(palette, "input")).luminance).toBeLessThan(
      parse(value(palette, "border")).luminance,
    );
  });
});
