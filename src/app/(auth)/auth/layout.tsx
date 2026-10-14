export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // No header or footer: sign-up and login are focused, single-purpose pages.
  // Redirecting signed-in users away is left to middleware, which can actually
  // read the session.
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(70%_60%_at_50%_0%,color-mix(in_oklab,var(--primary),transparent_88%),transparent)] px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
