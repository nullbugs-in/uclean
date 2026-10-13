export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // No header or footer: sign-up and login are focused, single-purpose pages.
  // Redirecting signed-in users away is left to middleware, which can actually
  // read the session.
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
