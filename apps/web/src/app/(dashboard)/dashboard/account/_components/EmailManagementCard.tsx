"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  ShieldAlert,
  Star,
  Trash2,
} from "lucide-react";
import type { EmailAddressResource } from "@clerk/types";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { AddEmailDialog } from "./AddEmailDialog";
import { clerkErrorMessage } from "./clerk-error";

export function EmailManagementCard() {
  const { isLoaded, user } = useUser();
  const [addOpen, setAddOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleMakePrimary = async (email: EmailAddressResource) => {
    if (!user) return;
    setPendingId(email.id);
    try {
      await user.update({ primaryEmailAddressId: email.id });
      await user.reload();
      toast.success(`${email.emailAddress} is now your primary email.`);
    } catch (err) {
      toast.error(
        clerkErrorMessage(err, "Could not set this as your primary email."),
      );
    } finally {
      setPendingId(null);
    }
  };

  const handleResend = async (email: EmailAddressResource) => {
    setPendingId(email.id);
    try {
      await email.prepareVerification({ strategy: "email_code" });
      toast.success(`Verification code sent to ${email.emailAddress}.`);
    } catch (err) {
      toast.error(
        clerkErrorMessage(err, "Could not send a verification code."),
      );
    } finally {
      setPendingId(null);
    }
  };

  const handleRemove = async (email: EmailAddressResource) => {
    if (!user) return;
    if (email.id === user.primaryEmailAddressId) {
      toast.error(
        "You can't remove your primary email. Make another one primary first.",
      );
      return;
    }
    setPendingId(email.id);
    try {
      await email.destroy();
      await user.reload();
      toast.success(`${email.emailAddress} removed.`);
    } catch (err) {
      toast.error(clerkErrorMessage(err, "Could not remove this email."));
    } finally {
      setPendingId(null);
    }
  };

  const emails = user?.emailAddresses ?? [];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Email addresses</CardTitle>
            <CardDescription>
              Sign-in identifiers and notification destinations. The
              primary email is what we display in your profile.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={!isLoaded}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add email
          </Button>
        </CardHeader>
        <CardContent>
          {!isLoaded ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your emails…
            </div>
          ) : emails.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No email addresses on file.
            </p>
          ) : (
            <ul className="divide-y divide-stone-200 dark:divide-white/10">
              {emails.map((email) => {
                const isPrimary = email.id === user?.primaryEmailAddressId;
                const isVerified = email.verification?.status === "verified";
                const busy = pendingId === email.id;

                return (
                  <li
                    key={email.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Mail className="h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                            {email.emailAddress}
                          </span>
                          {isPrimary ? (
                            <Badge variant="info" className="gap-1">
                              <Star className="h-3 w-3" />
                              Primary
                            </Badge>
                          ) : null}
                          {isVerified ? (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="gap-1">
                              <ShieldAlert className="h-3 w-3" />
                              Unverified
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={busy}
                            aria-label={`Manage ${email.emailAddress}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {!isPrimary && isVerified ? (
                            <DropdownMenuItem
                              onClick={() => handleMakePrimary(email)}
                              className="cursor-pointer"
                            >
                              <Star className="mr-2 h-4 w-4" />
                              Set as primary
                            </DropdownMenuItem>
                          ) : null}
                          {!isVerified ? (
                            <DropdownMenuItem
                              onClick={() => handleResend(email)}
                              className="cursor-pointer"
                            >
                              <Mail className="mr-2 h-4 w-4" />
                              Resend verification
                            </DropdownMenuItem>
                          ) : null}
                          {!isPrimary ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleRemove(email)}
                                className="cursor-pointer text-red-600 focus:text-red-700 dark:text-red-400 dark:focus:text-red-300"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddEmailDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
