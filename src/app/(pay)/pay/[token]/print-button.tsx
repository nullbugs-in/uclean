"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Prints or saves the invoice in front of you.
 *
 * Client-side for one reason: `window.print()` has no server equivalent. The
 * print stylesheet, not this button, is what makes the printed page the bill
 * rather than a copy of the screen - so the button hides itself from the printed
 * copy too.
 */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      className="invoice-screen-only w-full"
      onClick={() => window.print()}
    >
      <Printer aria-hidden />
      Print or save this invoice
    </Button>
  );
}
