import { z } from "zod";

import { canonicalizeMobile } from "@/lib/mobile";

/**
 * Mobile numbers are stored and dialled as E.164: "+919876543210".
 *
 * `canonicalizeMobile` runs as part of the schema rather than as a separate step
 * the caller might forget, which is how the login page ended up storing a
 * different identity from the booking wizard for the same person. Every mobile
 * that reaches the database now goes through this transform, on the server as
 * well as in the browser.
 */
const canonicalMobileSchema = z
  .string()
  .trim()
  .min(1, "Enter your mobile number")
  .transform((value, ctx) => {
    const canonical = canonicalizeMobile(value);

    if (!canonical) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid 10 digit mobile number",
      });
      return z.NEVER;
    }

    return canonical;
  });

/**
 * The shape a mobile field is checked against in the browser, before any
 * transformation, so a form can render "enter a valid number" while typing.
 */
export const mobileSchema = canonicalMobileSchema;

/** What signup asked for. Creates an account, and only if the number is free. */
export const signupRequestSchema = z.object({
  intent: z.literal("signup"),
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  mobile: canonicalMobileSchema,
});

/**
 * What login asked for.
 *
 * No name: a returning customer must not be asked for one again, and accepting
 * one here is what would let a login overwrite an existing profile.
 */
export const loginRequestSchema = z.object({
  intent: z.literal("login"),
  mobile: canonicalMobileSchema,
});

/**
 * The booking wizard's intent: sign the customer in if they already have an
 * account, register them if they do not.
 *
 * Without it the wizard would either ask every returning customer to sign up
 * again, or sign up numbers that are already registered.
 */
export const autoRequestSchema = z.object({
  intent: z.literal("auto"),
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  mobile: canonicalMobileSchema,
});

export const requestOtpSchema = z.discriminatedUnion("intent", [
  signupRequestSchema,
  loginRequestSchema,
  autoRequestSchema,
]);

export type SignupRequestInput = z.infer<typeof signupRequestSchema>;
export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
export type AutoRequestInput = z.infer<typeof autoRequestSchema>;
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

/**
 * The original signup fields, kept for the booking wizard's own form validation.
 *
 * The wizard validates with the signup shape because it always asks for a name,
 * then sends with `intent: "auto"` so the server decides what the number is.
 */
export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  mobile: mobileSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const verifyOtpSchema = z.object({
  mobile: canonicalMobileSchema,
  token: z.string().trim().length(6, "Enter the 6 digit code"),
  intent: z.enum(["signup", "login", "auto"]).default("login"),
  fullName: z.string().trim().min(2).max(120).optional(),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
