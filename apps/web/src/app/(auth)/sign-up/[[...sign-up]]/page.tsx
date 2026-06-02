"use client";

import { useAuth } from "@clerk/nextjs";
import { useSignUp } from "@clerk/nextjs/legacy";
import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getInvitationPrefill } from "@/server/actions/invitation.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { OTPInput } from "@/components/ui/otp-input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Loader2 } from "lucide-react";

function getClerkError(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "errors" in err) {
    const errors = (err as { errors: { message: string }[] }).errors;
    return errors?.[0]?.message || fallback;
  }
  return fallback;
}

/** Simple password strength calculation */
function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };

  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  if (score <= 1) return { score: 1, label: "Weak", color: "bg-red-500" };
  if (score <= 2) return { score: 2, label: "Fair", color: "bg-amber-500" };
  if (score <= 3) return { score: 3, label: "Good", color: "bg-yellow-500" };
  if (score <= 4) return { score: 4, label: "Strong", color: "bg-emerald-500" };
  return { score: 5, label: "Very strong", color: "bg-emerald-600" };
}

export default function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Clerk passes the invitation ticket in the URL (__clerk_ticket) when the
  // user clicks the invite email link. When a ticket is present we must use
  // `strategy: "ticket"` so Clerk marks the invitation accepted and copies
  // its publicMetadata (role/orgId/locationId/staffId) onto the new user.
  const invitationTicket = searchParams.get("__clerk_ticket");
  const isInvitationFlow = Boolean(invitationTicket);

  // If a Clerk session is already active (e.g., the user reached this page
  // after a partial sign-up that nevertheless created a session), route them
  // away from the form. Without this the next `signUp.create` call throws
  // "session already exists" and the user is stuck.
  //
  // Invitees go to /welcome (install the mobile app); self-serve owners go
  // to /onboarding. Manager/shift-lead invitees who reach this edge case
  // can sign out from /welcome and sign back in to land on /dashboard.
  useEffect(() => {
    if (!authLoaded || !isSignedIn) return;
    router.replace(isInvitationFlow ? "/welcome" : "/onboarding");
  }, [authLoaded, isSignedIn, isInvitationFlow, router]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // True once the invited staff member's name has been resolved from
  // their invitation, so the first/last name fields are locked the same
  // way the email is.
  const [namesLocked, setNamesLocked] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  // Resolve the invitee's email and name straight from the ticket via a
  // server lookup (the Backend API knows the invitation), then lock the
  // corresponding fields. This deliberately does NOT call
  // `signUp.create` on mount: doing so consumed the ticket through
  // Clerk's client SDK and triggered a sign-up reload loop. The actual
  // SignUp is still created on submit with the same ticket.
  useEffect(() => {
    if (!isInvitationFlow || !invitationTicket) return;
    let cancelled = false;

    void (async () => {
      const res = await getInvitationPrefill({ ticket: invitationTicket });
      if (cancelled || !res.success || !res.data) return;
      if (res.data.email) setEmail(res.data.email);
      if (res.data.firstName) setFirstName(res.data.firstName);
      if (res.data.lastName) setLastName(res.data.lastName);
      if (res.data.firstName || res.data.lastName) setNamesLocked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [isInvitationFlow, invitationTicket]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsLoading(true);
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setIsLoading(false);
      return;
    }

    try {
      // Clerk keeps a SignUp resource alive on the client after any partial
      // failure (e.g., a pwned-password rejection from prepare_verification).
      // Re-calling `signUp.create` against that resource is rejected with a
      // 400 ("session already exists"); the documented workaround is to call
      // `signUp.update` on the existing resource until it reaches `complete`.
      const hasInProgressSignUp =
        Boolean(signUp.id) && signUp.status !== "complete";

      if (isInvitationFlow && invitationTicket) {
        // Accept the invitation: Clerk verifies the email via the ticket,
        // so no OTP step is needed. The server webhook will then see the
        // invitation's publicMetadata on the new user and provision their
        // OrganizationMember row.
        const result = hasInProgressSignUp
          ? await signUp.update({ firstName, lastName, password })
          : await signUp.create({
              strategy: "ticket",
              ticket: invitationTicket,
              firstName,
              lastName,
              password,
            });

        if (result.status === "complete") {
          await setActive({ session: result.createdSessionId });

          // Always hand invitees to /welcome. That route is a server
          // component that reads the user's publicMetadata (set by Clerk
          // when the ticket was consumed) and either renders the
          // install-the-app card (staff) or redirects to /dashboard
          // (manager / shift_lead). Routing through the server-side gate
          // avoids the race where the freshly created user's metadata
          // hasn't propagated to the session JWT yet — without that,
          // middleware would bounce staff into the owner onboarding
          // wizard.
          router.push("/welcome");
          return;
        }

        // If Clerk still needs something (rare — e.g. additional custom
        // fields), fall through and surface an explanatory error.
        setError(
          `Sign-up needs more information (${result.status ?? "unknown"}). Contact your manager.`,
        );
        return;
      }

      // Standard (non-invited) sign-up: create or resume the SignUp, then
      // send the verification code.
      const result = hasInProgressSignUp
        ? await signUp.update({
            firstName,
            lastName,
            emailAddress: email,
            password,
          })
        : await signUp.create({
            firstName,
            lastName,
            emailAddress: email,
            password,
          });

      // Dev instances with email verification disabled can complete the
      // SignUp on `create`/`update` directly. Activate the session and let
      // the middleware route the user through onboarding.
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.push("/onboarding");
        return;
      }

      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      });

      setPendingVerification(true);
    } catch (err: unknown) {
      setError(getClerkError(err, "Something went wrong."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsLoading(true);
    setError("");

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/onboarding");
      } else {
        setError("Verification was not complete. Please try again.");
      }
    } catch (err: unknown) {
      setError(getClerkError(err, "Invalid verification code."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = () => {
    if (!isLoaded) return;
    signUp.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: "/sso-callback",
      redirectUrlComplete: "/onboarding",
    });
  };

  if (pendingVerification) {
    return (
      <Card className="w-full shadow-2xl backdrop-blur-3xl border-border">
        <CardHeader className="space-y-1 align-center text-center">
          <div className="w-full flex justify-center mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <Bot className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Verify your email</CardTitle>
          <CardDescription>
            We sent a verification code to {email}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4">
            <OTPInput
              value={code}
              onChange={setCode}
              disabled={isLoading}
            />
            {error && <p className="text-destructive text-sm font-medium text-center">{error}</p>}
            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading || code.length < 6}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify Identity
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full shadow-2xl backdrop-blur-3xl border-border">
      <CardHeader className="space-y-1 text-center">
        <div className="w-full flex justify-center mb-2">
          <div className="h-12 w-12 rounded-xl bg-primary border shadow-inner flex items-center justify-center">
            <Bot className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">
          {isInvitationFlow ? "Accept your invitation" : "Create an account"}
        </CardTitle>
        <CardDescription>
          {isInvitationFlow
            ? "Finish setting up your account to join your team."
            : "Enter your email below to create your account"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isInvitationFlow && (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleAuth}
              disabled={!isLoaded}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
                <path d="M1 1h22v22H1z" fill="none" />
              </svg>
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Input
                id="firstName"
                type="text"
                placeholder="First name"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                readOnly={namesLocked && Boolean(firstName)}
                disabled={namesLocked && Boolean(firstName)}
              />
            </div>
            <div className="space-y-2">
              <Input
                id="lastName"
                type="text"
                placeholder="Last name"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                readOnly={namesLocked && Boolean(lastName)}
                disabled={namesLocked && Boolean(lastName)}
              />
            </div>
          </div>
          {namesLocked && (
            <p className="text-muted-foreground text-xs">
              Your name is locked to what your manager entered. Contact them
              if it needs to change.
            </p>
          )}
          <div className="space-y-2">
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              readOnly={isInvitationFlow}
              disabled={isInvitationFlow}
            />
            {isInvitationFlow && (
              <p className="text-muted-foreground text-xs">
                Email is locked to the address your manager invited.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <PasswordInput
              id="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {password && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        level <= strength.score
                          ? strength.color
                          : "bg-stone-200 dark:bg-stone-700"
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs ${
                  strength.score <= 1 ? "text-red-500" :
                  strength.score <= 2 ? "text-amber-500" :
                  strength.score <= 3 ? "text-yellow-600 dark:text-yellow-500" :
                  "text-emerald-600 dark:text-emerald-500"
                }`}>
                  {strength.label}
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <PasswordInput
              id="confirmPassword"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <div id="clerk-captcha" />
          {error && <p className="text-destructive text-sm font-medium text-center">{error}</p>}
          <Button 
            type="submit" 
            className="w-full"
            disabled={isLoading || !email || !password || !firstName || !lastName || !confirmPassword}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isInvitationFlow ? "Accept invitation" : "Sign Up"}
          </Button>
        </form>
      </CardContent>
      {!isInvitationFlow && (
        <CardFooter className="flex justify-center border-t pt-6">
          <div className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-foreground font-medium underline-offset-4 hover:underline">
              Sign in
            </Link>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
