"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { MFASetupDialog } from "./MFASetupDialog";
import { BackupCodesDialog } from "./BackupCodesDialog";
import { clerkErrorMessage } from "./clerk-error";

export function MFACard() {
  const { isLoaded, user } = useUser();
  const [setupOpen, setSetupOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenCodes, setRegenCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<"disable" | "regenerate" | null>(null);

  const handleDisable = async () => {
    if (!user) return;
    setBusy("disable");
    try {
      await user.disableTOTP();
      await user.reload();
      toast.success("Two-factor authentication disabled.");
    } catch (err) {
      toast.error(
        clerkErrorMessage(err, "Could not disable two-factor authentication."),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleRegenerate = async () => {
    if (!user) return;
    setBusy("regenerate");
    try {
      const result = await user.createBackupCode();
      await user.reload();
      setRegenCodes(result.codes);
      setRegenOpen(true);
    } catch (err) {
      toast.error(
        clerkErrorMessage(err, "Could not generate new backup codes."),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              Two-factor authentication
              {user?.totpEnabled ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Enabled
                </Badge>
              ) : (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Off
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Require a 6-digit code from an authenticator app each time
              you sign in. Strongly recommended for owners and managers.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isLoaded ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : user?.totpEnabled ? (
            <>
              <p className="text-sm text-muted-foreground">
                You'll be asked for a 6-digit code from your authenticator
                app on every sign-in. Keep your backup codes in a safe
                place — they're the only way back into your account if
                you lose your device.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={busy !== null}
                >
                  {busy === "regenerate" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate backup codes
                    </>
                  )}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <ShieldOff className="mr-2 h-4 w-4" />
                      Disable two-factor
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Disable two-factor authentication?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Your account will be protected by your password
                        only. You can re-enable two-factor at any time.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={busy !== null}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDisable}
                        disabled={busy !== null}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {busy === "disable" ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Disabling…
                          </>
                        ) : (
                          "Disable"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Pair an authenticator app (1Password, Authy, Google
                Authenticator, etc.) with your account. We'll show you a
                QR code to scan and a set of backup codes for safekeeping.
              </p>
              <Button
                type="button"
                onClick={() => setSetupOpen(true)}
                disabled={!isLoaded}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Enable authenticator app
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <MFASetupDialog open={setupOpen} onOpenChange={setSetupOpen} />

      <BackupCodesDialog
        open={regenOpen}
        onOpenChange={(next) => {
          setRegenOpen(next);
          if (!next) setRegenCodes(null);
        }}
        codes={regenCodes ?? []}
        title="New backup codes"
        description="Your previous backup codes have been invalidated. Save these somewhere safe — each can be used once if you lose access to your authenticator app."
      />
    </>
  );
}
