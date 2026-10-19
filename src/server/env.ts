import "server-only";

/**
 * Environment access with explicit failure.
 *
 * Reading process.env directly gives you `undefined` and a confusing 500 much
 * later. These helpers turn a missing variable into a named error at the point
 * of use.
 */

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

export function requiredService(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}

/**
 * The secret that signs /pay/[token] links.
 *
 * Rotating it invalidates every outstanding payment link, so it must be kept
 * stable across deploys and identical between staging and production only
 * where you intend links to be interchangeable (you generally do not).
 */
export function paymentTokenSecret(): string {
  const secret = required("PAYMENT_TOKEN_SECRET");
  if (secret.length < 32) {
    throw new Error(
      "PAYMENT_TOKEN_SECRET must be at least 32 characters to be unguessable.",
    );
  }
  return secret;
}

/** Bearer token guarding every /api/cron/* route. */
export function cronSecret(): string {
  return required("CRON_SECRET");
}

/**
 * Server-side Maps key, restricted to the Routes API. Never exposed to the
 * browser.
 */
export function googleServerKey(): string {
  return required("GOOGLE_MAPS_SERVER_API_KEY");
}
