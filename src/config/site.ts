/**
 * Single source of truth for user-facing site configuration.
 *
 * Every value marked REPLACE BEFORE LAUNCH is a placeholder. Business values
 * that an admin should be able to change without a deploy (prices, slot
 * capacity, the live WhatsApp number) will eventually come from the database;
 * this file covers the pieces the marketing page needs before that exists.
 */

const whatsappFallback = "918073974160";

/** Digits only, so it is safe to drop straight into a wa.me URL. */
const whatsappNumber = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? whatsappFallback
).replace(/\D/g, "");

export type OpeningHours = {
  /** Human label, e.g. "Monday to Saturday". */
  days: string;
  /** 24h times, e.g. "10:00". */
  opens: string;
  closes: string;
};

export type SocialLink = {
  label: string;
  href: string;
};

export const siteConfig = {
  name: "UClean",
  tagline: "Fresh laundry, picked up and delivered to your door.",

  /**
   * Brand logo, served from `public/`.
   *
   * The artwork is a full lockup: the "U" mark, the UCLEAN wordmark, and the
   * "WE LAUNDRY" tagline, on a transparent background at 418x185 (about
   * 2.26:1). Because the wordmark is already part of the image, the header and
   * footer do not repeat the name as text next to it; the surrounding link
   * carries an aria-label so the accessible name is still announced.
   *
   * Intrinsic dimensions are declared so next/image can reserve the box and
   * avoid a layout shift, and every usage sizes it by height with `w-auto` so
   * the aspect ratio is preserved.
   */
  logo: {
    src: "/uclean-logo.png",
    width: 418,
    height: 185,
  },
  description:
    "Book laundry pickup and delivery online. Choose an hourly slot, track your order, and pay on delivery - free pickup and delivery within 6 km of our store.",
  /** REPLACE BEFORE LAUNCH: production URL, used for metadata and JSON-LD. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://uclean.example.com",

  address: {
    line1: "2979/1, D21/1, 6th Main Rd",
    line2: "Vani Vilas Mohalla",
    city: "Mysuru",
    state: "Karnataka",
    postalCode: "570002",
    country: "IN",
  },

  phone: "+91 80739 74160",
  email: "Jasalventures@gmail.com",

  /**
   * Read from NEXT_PUBLIC_WHATSAPP_NUMBER when set, otherwise the placeholder
   * above. Stored as digits only for wa.me links.
   */
  whatsappNumber,
  whatsappMessage:
    "Hi UClean, I would like to book a laundry pickup and delivery.",

  /** Store coordinates, reused by the directions link and the admin panel. */
  coordinates: {
    lat: 12.3248091,
    lng: 76.6288967,
  },
  mapsEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3897.8659374082317!2d76.6288967!3d12.324809099999998!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3baf7b70bfaa3bbf%3A0x8b986ce7166457d2!2sUClean%20Laundry%20%7C%20Dry%20Cleaning%20%7C%20Shoe%20Cleaning%20%7C%20Curtain%20Cleaning%20%7C%20Carpet%20Cleaning!5e0!3m2!1sen!2sin!4v1791973308589!5m2!1sen!2sin",
  mapsDirectionsUrl:
    "https://www.google.com/maps/dir/?api=1&destination=12.3248091,76.6288967",

  openingHours: [
    { days: "All days", opens: "09:30", closes: "20:00" },
  ] as OpeningHours[],

  /** Pickup hours shown on the booking page; the 2-3 PM break is intentional. */
  pickupSlots: [
    { days: "Morning", opens: "10:00", closes: "14:00" },
    { days: "Evening", opens: "15:00", closes: "20:00" },
  ] as OpeningHours[],

  /** REPLACE BEFORE LAUNCH: real social profiles; hrefs are placeholders. */
  social: [
    { label: "Instagram", href: "#" },
    { label: "Facebook", href: "#" },
    { label: "X", href: "#" },
  ] as SocialLink[],

  /** Driving-distance service radius, also mirrored in the database. */
  deliveryRadiusKm: 6,

  /**
   * Delivery pricing quoted on the public price list.
   *
   * These are display-only figures for the marketing page. The charge actually
   * applied to an order is computed in `src/server/billing.ts` from the draft,
   * so keep the two in step if this ever changes.
   */
  deliveryPolicy: {
    /** Orders at or above this subtotal ship free. */
    freeAboveInr: 999,
    /** Flat charge below that threshold. */
    chargeInr: 69,
  },
} as const;

/** wa.me link with the default prefilled message. */
export function whatsAppLink(message: string = siteConfig.whatsappMessage) {
  return `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/** Address as a single comma-separated line. */
export function formattedAddress() {
  const { line1, line2, city, state, postalCode } = siteConfig.address;
  return [line1, line2, city, state, postalCode].filter(Boolean).join(", ");
}

/**
 * Renders a 24-hour "HH:MM" config value as "9:30 am" for display.
 *
 * The stored times stay 24-hour because schema.org and the booking maths both
 * expect that format; only the human-facing surfaces convert. Non 24-hour input
 * is returned untouched so a typo shows up rather than silently becoming NaN.
 */
export function formatTime12h(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;

  const hours = Number(match[1]);
  const minutes = match[2];
  if (hours > 23) return time;

  const period = hours < 12 ? "am" : "pm";
  // 0 and 12 both display as 12.
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;

  return `${displayHours}:${minutes} ${period}`;
}

/**
 * Opening hours as `{ days, hours }` pairs for the two-column layouts, e.g.
 * `{ days: "All days", hours: "9:30 am - 8:00 pm" }`.
 *
 * Structured rather than a pre-joined string so callers can lay the two parts
 * out separately without having to parse the label back apart.
 */
export function openingHoursRows() {
  return siteConfig.openingHours.map((entry) => ({
    days: entry.days,
    hours: `${formatTime12h(entry.opens)} - ${formatTime12h(entry.closes)}`,
  }));
}

/**
 * Opening hours as schema.org `openingHoursSpecification` objects.
 *
 * `openingHours[].days` is a human label, so it is mapped back to real weekday
 * names here. An unrecognised label falls back to the full week, which is
 * correct for the current single "All days" entry and errs on the side of
 * showing more availability rather than less if the config grows later.
 */
export function openingHoursSpecification() {
  const allDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const daysByLabel: Record<string, string[]> = {
    "All days": allDays,
    "Monday to Saturday": allDays.slice(0, 6),
    Sunday: ["Sunday"],
  };

  return siteConfig.openingHours.map((entry) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: daysByLabel[entry.days] ?? allDays,
    opens: entry.opens,
    closes: entry.closes,
  }));
}
