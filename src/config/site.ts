/**
 * Single source of truth for user-facing site configuration.
 *
 * Every value marked REPLACE BEFORE LAUNCH is a placeholder. Business values
 * that an admin should be able to change without a deploy (prices, slot
 * capacity, the live WhatsApp number) will eventually come from the database;
 * this file covers the pieces the marketing page needs before that exists.
 */

const whatsappFallback = "919999999999";

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

  /** REPLACE BEFORE LAUNCH: real store address. */
  address: {
    line1: "123 Market Road",
    line2: "Near City Centre",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "IN",
  },

  /** REPLACE BEFORE LAUNCH: real store phone number. */
  phone: "+91 90000 00000",

  /**
   * Read from NEXT_PUBLIC_WHATSAPP_NUMBER when set, otherwise the placeholder
   * above. Stored as digits only for wa.me links.
   */
  whatsappNumber,
  whatsappMessage:
    "Hi UClean, I would like to book a laundry pickup and delivery.",

  /** REPLACE BEFORE LAUNCH: store coordinates / a real Google Maps embed. */
  mapsEmbedUrl:
    "https://www.google.com/maps?q=MG%20Road%20Bengaluru&output=embed",
  mapsDirectionsUrl:
    "https://www.google.com/maps/dir/?api=1&destination=UClean",

  /** REPLACE BEFORE LAUNCH: confirm the real opening hours. */
  openingHours: [
    { days: "Monday to Saturday", opens: "10:00", closes: "20:00" },
    { days: "Sunday", opens: "10:00", closes: "14:00" },
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
