"use client";

import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";

/**
 * Providers the panels need, scoped to the panels.
 *
 * Mounted from the three panel layouts rather than the root layout so public
 * pages never pay for the theme script and the shared root layout stays
 * untouched.
 *
 * `attribute="class"` is what makes the `.dark` token block in globals.css
 * reachable at all; the palette always had dark values, but nothing ever
 * applied the class. next-themes injects a blocking script that sets it before
 * first paint, so there is no light flash on a dark system. The root <html>
 * already carries suppressHydrationWarning for that reason.
 *
 * `defaultTheme="system"` follows the OS until someone picks a side, and
 * `disableTransitionOnChange` stops every surface animating at once when they
 * do.
 */
export function PanelProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}
