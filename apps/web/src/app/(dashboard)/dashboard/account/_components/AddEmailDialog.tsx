"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail } from "lucide-react";
import type { EmailAddressResource } from "@clerk/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { OTPInput } from "@/components/ui/otp-input";
import {
  addEmailSchema,
  verifyCodeSchema,
  type AddEmailInput,
  type VerifyCodeInput,
} from "@/lib/validations/account";

import { clerkErrorMessage } from "./clerk-error";

interface AddEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "enter-email" | "enter-code";

/**
 * Two-step add-email flow:
 *
 *   1. Caller submits an address. We create the email on the user
 *      (`user.createEmailAddress`) and ask Clerk to dispatch an
 *      `email_code` challenge (`prepareVerification`).
 *   2. Caller enters the 6-digit code. We submit it to Clerk
 *      (`attemptVerification`); on success the address flips to
 *      `verified` and is eligible to be made primary.
 *
 * The dialog never marks the new address as primary on its own —
 * that's an explicit per-row action in `EmailManagementCard`.
 */
export function AddEmailDialog({ open, onOpenChange }: AddEmailDialogProps) {
  const { user } = useUser();
  const [step, setStep] = useState<Step>("enter-email");
  const [pendingEmail, setPendingEmail] = useState<EmailAddressResource | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailForm = useForm<AddEmailInput>({
    resolver: zodResolver(addEmailSchema),
    defaultValues: { email: "" },
  });

  const codeForm = useForm<VerifyCodeInput>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: { code: "" },
  });

  const reset = useCallback(() => {
    setStep("enter-email");
    setPendingEmail(null);
    setSubmitting(false);
    setError(null);
    emailForm.reset({ email: "" });
    codeForm.reset({ code: "" });
  }, [codeForm, emailForm]);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const onSubmitEmail = async (values: AddEmailInput) => {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await user.createEmailAddress({ email: values.email });
      await created.prepareVerification({ strategy: "email_code" });
      await user.reload();
      setPendingEmail(created);
      setStep("enter-code");
    } catch (err) {
      setError(clerkErrorMessage(err, "Could not start email verification."));
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitCode = async (values: VerifyCodeInput) => {
    if (!user || !pendingEmail) return;
    setSubmitting(true);
    setError(null);
    try {
      const verified = await pendingEmail.attemptVerification({
        code: values.code,
      });
      if (verified.verification?.status !== "verified") {
        setError("That code didn't verify your email. Try again.");
        return;
      }
      await user.reload();
      onOpenChange(false);
    } catch (err) {
      setError(clerkErrorMessage(err, "That code didn't work."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail) return;
    setSubmitting(true);
    setError(null);
    try {
      await pendingEmail.prepareVerification({ strategy: "email_code" });
    } catch (err) {
      setError(clerkErrorMessage(err, "Could not resend the code."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add an email address</DialogTitle>
          <DialogDescription>
            {step === "enter-email"
              ? "We'll send a 6-digit code to verify ownership before adding it to your account."
              : `Enter the code we sent to ${pendingEmail?.emailAddress ?? "your inbox"}.`}
          </DialogDescription>
        </DialogHeader>

        {step === "enter-email" ? (
          <Form {...emailForm}>
            <form
              onSubmit={emailForm.handleSubmit(onSubmitEmail)}
              className="space-y-4"
            >
              <FormField
                control={emailForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        disabled={submitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error ? (
                <p
                  role="alert"
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send code
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <Form {...codeForm}>
            <form
              onSubmit={codeForm.handleSubmit(onSubmitCode)}
              className="space-y-4"
            >
              <FormField
                control={codeForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Verification code</FormLabel>
                    <FormControl>
                      <OTPInput
                        value={field.value}
                        onChange={field.onChange}
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error ? (
                <p
                  role="alert"
                  className="text-sm text-red-600 dark:text-red-400 text-center"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="link"
                  className="px-0"
                  onClick={handleResend}
                  disabled={submitting}
                >
                  Resend code
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="px-0 text-muted-foreground"
                  onClick={() => {
                    setStep("enter-email");
                    setError(null);
                    codeForm.reset({ code: "" });
                  }}
                  disabled={submitting}
                >
                  Use a different email
                </Button>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    "Verify and add"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
