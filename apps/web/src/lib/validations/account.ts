/**
 * Web-only validation schemas for the `/dashboard/account` page.
 *
 * Identity mutations are routed through Clerk's client SDK (`useUser()`),
 * so these schemas only enforce shape and basic constraints in the form
 * before submitting. Clerk performs the authoritative validation
 * (password strength, email uniqueness, code correctness, etc.) and
 * surfaces detailed errors that we display verbatim.
 *
 * Mobile (`apps/mobile/features/profile|settings`) maintains its own
 * inline validation tied to native inputs, so these intentionally do
 * not live in `@sous/types`.
 */
import { z } from "zod";

export const nameSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .max(50, "First name must be 50 characters or fewer."),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required.")
    .max(50, "Last name must be 50 characters or fewer."),
});
export type NameInput = z.infer<typeof nameSchema>;

export const addEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});
export type AddEmailInput = z.infer<typeof addEmailSchema>;

export const verifyCodeSchema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your inbox."),
});
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;

export const mfaCodeSchema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."),
});
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
    signOutOfOtherSessions: z.boolean(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "New password and confirmation do not match.",
    path: ["confirmPassword"],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "Choose a new password that's different from the current one.",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const setPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Password and confirmation do not match.",
    path: ["confirmPassword"],
  });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
