"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Loader2, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { TOTPResource } from "@clerk/types";

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
import { OTPInput } from "@/components/ui/otp-input";
import { mfaCodeSchema, type MfaCodeInput } from "@/lib/validations/account";

import { BackupCodesDialog } from "./BackupCodesDialog";
import { clerkErrorMessage } from "./clerk-error";

interface MFASetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "scan" | "verify";

/**
 * Three-step TOTP enrolment.
 *
 *   1. `scan` — `user.createTOTP()` returns a `secret` and a
 *      provisioning URI (`otpauth://totp/...`). We render a QR code
 *      and the secret so the user can pair their authenticator app.
 *   2. `verify` — user enters the rolling 6-digit code; we submit it
 *      via `user.verifyTOTP({ code })`. Clerk flips `totpEnabled` on
 *      the user resource.
 *   3. After a successful verification we mint backup codes via
 *      `user.createBackupCode()` and hand them off to
 *      `BackupCodesDialog` (one-shot display).
 */
export function MFASetupDialog({ open, onOpenChange }: MFASetupDialogProps) {
  const { user } = useUser();
  const [step, setStep] = useState<Step>("scan");
  const [totp, setTotp] = useState<TOTPResource | null>(null);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  const [backupCodesOpen, setBackupCodesOpen] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const form = useForm<MfaCodeInput>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: "" },
  });

  const reset = useCallback(() => {
    setStep("scan");
    setTotp(null);
    setCreating(false);
    setSubmitting(false);
    setError(null);
    setSecretCopied(false);
    form.reset({ code: "" });
  }, [form]);

  // Mint a TOTP secret as soon as the dialog opens, so the user
  // sees the QR code immediately. If they cancel before verifying,
  // Clerk's `verified: false` TOTP record is harmless and will be
  // overwritten the next time they re-open the dialog.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCreating(true);
    setError(null);
    user
      .createTOTP()
      .then((next) => {
        if (cancelled) return;
        setTotp(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          clerkErrorMessage(err, "Could not start authenticator setup."),
        );
      })
      .finally(() => {
        if (cancelled) return;
        setCreating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      reset();
    }
  }, [open, reset]);

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const handleCopySecret = async () => {
    if (!totp?.secret) return;
    try {
      await navigator.clipboard.writeText(totp.secret);
      setSecretCopied(true);
      window.setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; fall through silently.
    }
  };

  const onSubmitCode = async (values: MfaCodeInput) => {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const verified = await user.verifyTOTP({ code: values.code });
      if (!verified.verified) {
        setError("That code didn't verify. Try the next rolling code.");
        return;
      }
      const backup = await user.createBackupCode();
      await user.reload();
      setBackupCodes(backup.codes);
      setBackupCodesOpen(true);
      onOpenChange(false);
    } catch (err) {
      setError(clerkErrorMessage(err, "That code didn't work."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {step === "scan"
                ? "Set up authenticator app"
                : "Confirm your authenticator"}
            </DialogTitle>
            <DialogDescription>
              {step === "scan"
                ? "Scan the QR code with your authenticator app, or enter the secret manually."
                : "Enter the 6-digit code currently shown in your authenticator app."}
            </DialogDescription>
          </DialogHeader>

          {step === "scan" ? (
            <div className="space-y-4">
              {creating ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating secret…
                </div>
              ) : totp?.uri ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="rounded bg-white p-3">
                    <QRCodeSVG
                      value={totp.uri}
                      size={176}
                      level="M"
                      marginSize={1}
                    />
                  </div>
                  {totp.secret ? (
                    <div className="w-full space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Or paste this secret into your app:
                      </p>
                      <div className="flex items-center gap-2 rounded border border-stone-300 dark:border-white/10 bg-stone-100 dark:bg-stone-900 px-3 py-2">
                        <code className="flex-1 break-all font-mono text-xs text-stone-900 dark:text-stone-100">
                          {totp.secret}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={handleCopySecret}
                          aria-label="Copy secret"
                        >
                          {secretCopied ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error ?? "Could not load the authenticator setup."}
                </p>
              )}

              {error && totp?.uri ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
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
                <Button
                  type="button"
                  onClick={() => setStep("verify")}
                  disabled={creating || !totp?.uri}
                >
                  I&apos;ve added it — continue
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmitCode)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">Authenticator code</FormLabel>
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

                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setStep("scan");
                      setError(null);
                      form.reset({ code: "" });
                    }}
                    disabled={submitting}
                  >
                    Back
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Enable two-factor
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <BackupCodesDialog
        open={backupCodesOpen}
        onOpenChange={(next) => {
          setBackupCodesOpen(next);
          if (!next) setBackupCodes([]);
        }}
        codes={backupCodes}
        title="Save your backup codes"
        description="Two-factor is now enabled. These backup codes are the only way back into your account if you lose access to your authenticator. Store them somewhere safe — they won't be shown again."
      />
    </>
  );
}
