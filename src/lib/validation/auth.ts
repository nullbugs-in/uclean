import { z } from "zod";

/**
 * Mobile numbers are stored and dialled as E.164-ish digits. Supabase phone
 * auth accepts "+91XXXXXXXXXX"; the schema keeps the leading + and the country
 * code so the OTP goes to the right place.
 */
export const mobileSchema = z
  .string()
  .trim()
  .min(10, "Enter a valid mobile number")
  .max(16, "Enter a valid mobile number")
  .regex(/^\+?[1-9]\d{9,14}$/, "Enter a valid mobile number");

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  mobile: mobileSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const verifyOtpSchema = z.object({
  mobile: mobileSchema,
  token: z.string().trim().length(6, "Enter the 6 digit code"),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
