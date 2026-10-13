import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-base font-bold tracking-tight">
            UClean
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/services"
              className="rounded-md px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
            >
              Services
            </Link>
            <Link
              href="/account"
              className="rounded-md px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
            >
              My Orders
            </Link>
            <Button asChild size="sm">
              <Link href="/book">Book Now</Link>
            </Button>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-[var(--muted-foreground)] sm:px-6">
          <p className="text-foreground font-medium">UClean</p>
          <p>Laundry pickup and delivery within 6 km of our store.</p>
          <p className="text-xs">
            Store hours, address, social links and legal pages render here in
            Milestone 2.
          </p>
        </div>
      </footer>
    </div>
  );
}
