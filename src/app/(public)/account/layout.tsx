import type { Metadata } from "next";

import "./account-theme.css";

export const metadata: Metadata = { title: "My Account" };

/**
 * Shell for the customer's account pages.
 *
 * Deliberately chrome-free: the public layout above already supplies the
 * navbar, footer and WhatsApp button, which is what makes these pages read as
 * inner pages of the site rather than as a separate panel.
 *
 * The glass tokens are imported here and nowhere else, so staff and admin are
 * unaffected.
 */
export default function AccountInnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className="relative min-h-full"
      style={{ background: "var(--uc-bg-gradient)" }}
    >
      {/* Soft blurred blobs, decorative only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-24 -left-24 size-[380px] rounded-full bg-[var(--uc-lime-300)] opacity-35 blur-3xl" />
        <div className="absolute right-0 bottom-0 size-[380px] rounded-full bg-[var(--uc-teal-500)] opacity-20 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </div>
    </div>
  );
}
