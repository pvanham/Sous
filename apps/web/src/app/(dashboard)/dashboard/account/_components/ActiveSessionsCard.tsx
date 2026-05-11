"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import {
  Globe,
  Loader2,
  LogOut,
  Monitor,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import type { SessionWithActivitiesResource } from "@clerk/types";

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

import { clerkErrorMessage } from "./clerk-error";

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

function formatRelative(date: Date | null | undefined): string {
  if (!date) return "—";
  const diffMs = date.getTime() - Date.now();
  const minutes = Math.round(diffMs / (60 * 1000));
  if (Math.abs(minutes) < 60) return RELATIVE_TIME.format(minutes, "minute");
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (Math.abs(hours) < 24) return RELATIVE_TIME.format(hours, "hour");
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return RELATIVE_TIME.format(days, "day");
}

function describeLocation(
  session: SessionWithActivitiesResource,
): string {
  const { city, country } = session.latestActivity ?? {};
  const parts = [city, country].filter((s): s is string => !!s);
  return parts.length > 0 ? parts.join(", ") : "Unknown location";
}

function describeDevice(
  session: SessionWithActivitiesResource,
): { label: string; isMobile: boolean } {
  const activity = session.latestActivity;
  const browser = activity?.browserName ?? "Browser";
  const device = activity?.deviceType ?? (activity?.isMobile ? "Mobile" : "Desktop");
  return {
    label: `${browser} on ${device}`,
    isMobile: !!activity?.isMobile,
  };
}

export function ActiveSessionsCard() {
  const { user, isLoaded: userLoaded } = useUser();
  const { session: currentSession } = useSession();
  const [sessions, setSessions] = useState<
    SessionWithActivitiesResource[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const next = await user.getSessions();
      setSessions(next);
    } catch (err) {
      toast.error(clerkErrorMessage(err, "Could not load active sessions."));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (userLoaded && user && sessions === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void refresh();
    }
  }, [refresh, sessions, user, userLoaded]);

  const handleRevoke = async (session: SessionWithActivitiesResource) => {
    setRevokingId(session.id);
    try {
      await session.revoke();
      toast.success("Session revoked.");
      await refresh();
    } catch (err) {
      toast.error(clerkErrorMessage(err, "Could not revoke that session."));
    } finally {
      setRevokingId(null);
    }
  };

  const otherSessions = useMemo(() => {
    if (!sessions || !currentSession) return [];
    return sessions.filter((s) => s.id !== currentSession.id);
  }, [sessions, currentSession]);

  const handleRevokeAllOthers = async () => {
    if (otherSessions.length === 0) return;
    setRevokingAll(true);
    try {
      const results = await Promise.allSettled(
        otherSessions.map((s) => s.revoke()),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast.error(
          `Revoked ${otherSessions.length - failed} session${
            otherSessions.length - failed === 1 ? "" : "s"
          }; ${failed} could not be revoked.`,
        );
      } else {
        toast.success(
          `Signed out of ${otherSessions.length} other session${
            otherSessions.length === 1 ? "" : "s"
          }.`,
        );
      }
      await refresh();
    } finally {
      setRevokingAll(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>
            Devices and browsers currently signed in. Revoke anything you
            don&apos;t recognise.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh sessions"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessions === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading sessions…
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active sessions found.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 dark:divide-white/10">
            {sessions.map((session) => {
              const isCurrent = session.id === currentSession?.id;
              const device = describeDevice(session);
              const Icon = device.isMobile ? Smartphone : Monitor;

              return (
                <li
                  key={session.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon className="h-5 w-5 shrink-0 text-stone-500 dark:text-stone-400 mt-0.5" />
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                          {device.label}
                        </span>
                        {isCurrent ? (
                          <Badge variant="info">This device</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {describeLocation(session)} · last active{" "}
                        {formatRelative(session.lastActiveAt)}
                      </p>
                    </div>
                  </div>

                  {!isCurrent ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(session)}
                      disabled={revokingId === session.id || revokingAll}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      {revokingId === session.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Revoking…
                        </>
                      ) : (
                        <>
                          <LogOut className="mr-2 h-4 w-4" />
                          Revoke
                        </>
                      )}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {otherSessions.length > 0 ? (
          <div className="pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={revokingAll || revokingId !== null}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out of all other sessions
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Sign out of {otherSessions.length} other session
                    {otherSessions.length === 1 ? "" : "s"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Anyone signed in elsewhere will be sent back to the
                    sign-in page. You&apos;ll stay signed in on this device.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={revokingAll}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRevokeAllOthers}
                    disabled={revokingAll}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {revokingAll ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Revoking…
                      </>
                    ) : (
                      "Sign out everywhere else"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
