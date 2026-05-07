"use client";

import { useCallback, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB; matches Clerk's documented limit
const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

interface ProfileImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal that lets the signed-in user upload, replace, or remove
 * their Clerk-hosted profile picture, and then mirrors the resulting
 * URL into our own Mongo records via `/api/me/profile-image`.
 *
 * The actual image bytes never touch our backend — Clerk hosts the
 * file. We only sync the URL so list views (rosters, schedules) can
 * render the avatar without a per-row Clerk fetch.
 */
export function ProfileImageDialog({
  open,
  onOpenChange,
}: ProfileImageDialogProps) {
  const { user, isLoaded } = useUser();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setPendingFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
    setSubmitting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    resetState();
    onOpenChange(false);
  }, [onOpenChange, resetState, submitting]);

  const handleFileSelect = (file: File | null) => {
    setError(null);
    if (!file) {
      setPendingFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    if (!ACCEPTED_MIME.includes(file.type)) {
      setError("Please choose a JPEG, PNG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 10 MB or smaller.");
      return;
    }
    setPendingFile(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const syncMongoMirror = async (imageUrl: string | null) => {
    // Pull-from-Clerk semantics: we send `null` only when the user
    // removed their image. Otherwise we send an empty body and let
    // the server fetch the canonical `image_url` from Clerk.
    const body = imageUrl === null ? JSON.stringify({ imageUrl: null }) : "";
    const response = await fetch("/api/me/profile-image", {
      method: "POST",
      headers:
        body.length > 0
          ? { "Content-Type": "application/json" }
          : undefined,
      body: body.length > 0 ? body : undefined,
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(
        data?.error ?? "Failed to sync your profile image. Please retry.",
      );
    }
  };

  const handleUpload = async () => {
    if (!user || !pendingFile) return;
    setSubmitting(true);
    setError(null);
    try {
      await user.setProfileImage({ file: pendingFile });
      await user.reload();
      await syncMongoMirror(user.imageUrl ?? null);
      resetState();
      onOpenChange(false);
    } catch (err) {
      setError(extractErrorMessage(err));
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!user || !user.hasImage) return;
    setSubmitting(true);
    setError(null);
    try {
      await user.setProfileImage({ file: null });
      await user.reload();
      await syncMongoMirror(null);
      resetState();
      onOpenChange(false);
    } catch (err) {
      setError(extractErrorMessage(err));
      setSubmitting(false);
    }
  };

  const initials = user
    ? `${user.firstName?.charAt(0) ?? ""}${user.lastName?.charAt(0) ?? ""}` ||
      "U"
    : "U";

  const displayedImage = previewUrl ?? user?.imageUrl ?? undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Profile picture</DialogTitle>
          <DialogDescription>
            Upload a square JPEG, PNG, WEBP, or GIF (10 MB max). Your photo
            will appear next to your name across schedules, rosters, and
            chat.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <Avatar className="h-32 w-32 border border-stone-300 dark:border-white/10">
            {displayedImage ? (
              <AvatarImage src={displayedImage} alt="Profile picture" />
            ) : null}
            <AvatarFallback className="bg-stone-900 text-stone-50 dark:bg-white dark:text-stone-900 text-3xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME.join(",")}
            className="sr-only"
            aria-label="Choose profile picture"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              handleFileSelect(file);
            }}
            disabled={submitting || !isLoaded}
          />

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || !isLoaded}
            >
              <Upload className="mr-2 h-4 w-4" />
              {pendingFile ? "Choose another" : "Choose photo"}
            </Button>
            {user?.hasImage && !pendingFile ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleRemove}
                disabled={submitting}
                className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            ) : null}
          </div>

          {error ? (
            <p
              role="alert"
              className={cn(
                "text-sm text-red-600 dark:text-red-400 text-center px-2",
              )}
            >
              {error}
            </p>
          ) : null}

          {!user?.hasImage && !pendingFile ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" />
              You&apos;re currently using the default avatar.
            </p>
          ) : null}
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
          <Button
            type="button"
            onClick={handleUpload}
            disabled={submitting || !pendingFile}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function extractErrorMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    return (
      err.errors?.[0]?.longMessage ??
      err.errors?.[0]?.message ??
      "Could not update your profile picture."
    );
  }
  if (err instanceof Error) return err.message;
  return "Could not update your profile picture.";
}
