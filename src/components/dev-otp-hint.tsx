"use client";

/**
 * The development OTP hint.
 *
 * Locally there is no SMS provider, so `sendLoginOtp` logs the code instead of
 * sending it (see `src/server/otp.ts`). Without this panel a developer signing
 * in through /auth has no way to see that code short of the server console.
 *
 * `devOtpCode()` returns null in production, so nothing here renders in a
 * production build.
 *
 * Extracted from the booking wizard so the book page and the auth pages say the
 * same thing and cannot drift.
 */
export function DevOtpHint({
  code,
  onUse,
}: {
  code: string;
  /** Makes the code click-to-fill. Omit where the field is not on this screen. */
  onUse?: () => void;
}) {
  return (
    <p className="border-primary/40 bg-primary/10 rounded-lg border px-3 py-2 text-xs">
      <span className="font-semibold">Dev mode:</span> no SMS is sent. Use code{" "}
      {onUse ? (
        <button
          type="button"
          className="font-mono font-semibold underline"
          onClick={onUse}
        >
          {code}
        </button>
      ) : (
        <span className="font-mono font-semibold">{code}</span>
      )}
      .
    </p>
  );
}
