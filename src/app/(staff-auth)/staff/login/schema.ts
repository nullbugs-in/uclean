import { z } from "zod";

/**
 * Staff/admin sign-in input.
 *
 * Kept local to this route rather than in `src/lib/validation/auth.ts`, which
 * is shared with the customer phone-OTP flow.
 */
export const staffLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
