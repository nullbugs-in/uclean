/**
 * Staff and admin sign-in shell.
 *
 * Deliberately separate from `(auth)`, which belongs to the customer phone-OTP
 * flow. This group exists so `/staff/login` renders without the staff panel's
 * role guard: that guard lives in `(staff)/layout.tsx` and would lock out the
 * very people signing in.
 */
export default function StaffAuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(70%_60%_at_50%_0%,color-mix(in_oklab,var(--primary),transparent_88%),transparent)] px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
