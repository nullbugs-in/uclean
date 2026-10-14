import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Book a pickup" };

/**
 * The booking wizard moved to the public `/book` page, where verification is
 * part of the flow itself, so this route only redirects to keep old links and
 * the account nav working.
 */
export default function AccountBookPage() {
  redirect("/book");
}
