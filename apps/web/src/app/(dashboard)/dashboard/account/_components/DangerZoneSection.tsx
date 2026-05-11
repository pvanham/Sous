"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { AlertTriangle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { DeleteAccountDialog } from "./DeleteAccountDialog";

export function DangerZoneSection() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="border-red-300 dark:border-red-900/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            Delete account
          </CardTitle>
          <CardDescription>
            Permanently delete your Sous account, sign-in identifiers,
            and personal data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>
              Your name, email, profile picture, and authenticator
              enrolment will be erased from Clerk.
            </li>
            <li>
              Your staff records, time-off requests, and shift exchanges
              will be unlinked. Past shift history is preserved on the
              schedule but anonymised.
            </li>
            <li>
              If you&apos;re the sole owner of your organization, the entire
              organization, its locations, kitchen config, and team
              memberships are removed with it.
            </li>
            <li>
              This action cannot be undone. Consider exporting any data
              you need first.
            </li>
          </ul>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setOpen(true)}
            disabled={!user}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <DeleteAccountDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
