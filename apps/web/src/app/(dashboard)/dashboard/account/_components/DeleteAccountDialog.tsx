"use client";

import { useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONFIRM_PHRASE = "DELETE";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Type-to-confirm account deletion. Once the user types `DELETE`, we
 * call our existing privileged route at `DELETE /api/me/account` (which
 * gates on `auth()` and uses the Clerk backend `users.deleteUser`),
 * then sign the user out via Clerk and redirect to the marketing site.
 *
 * The Clerk `user.deleted` webhook in
 * `apps/web/src/app/api/webhooks/clerk/route.ts` is the authoritative
 * cleanup path for our Mongo data, so this dialog only needs to trigger
 * the deletion and clear the local session.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
}: DeleteAccountDialogProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmation("");
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const canDelete = confirmation === CONFIRM_PHRASE && !submitting;

  const handleDelete = async () => {
    if (!canDelete || !user) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/me/account", { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          data?.error ?? "Failed to delete your account. Please retry.",
        );
      }
      toast.success("Account deleted. We're sorry to see you go.");
      // Sign out clears the Clerk session client-side and redirects.
      // The Clerk user is already gone server-side, but Clerk's session
      // cleanup is idempotent here.
      await signOut({ redirectUrl: "/" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete your account.";
      setError(message);
      toast.error(message);
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Delete your account?
          </DialogTitle>
          <DialogDescription>
            This permanently deletes your Sous account and Clerk identity.
            If you're the sole owner of your organization, your kitchen,
            locations, and team memberships are removed with it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded border border-red-300 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-900 dark:text-red-200">
          <p className="font-medium">This cannot be undone.</p>
          <p>
            Type <span className="font-mono font-semibold">DELETE</span>{" "}
            below to confirm.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="delete-confirm" className="text-sm">
            Confirmation
          </Label>
          <Input
            id="delete-confirm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            disabled={submitting}
            aria-describedby="delete-confirm-hint"
          />
          <p
            id="delete-confirm-hint"
            className="text-xs text-muted-foreground"
          >
            Case-sensitive. Must match exactly.
          </p>
        </div>

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
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete my account
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
