"use client";

import { useSignIn } from "@clerk/nextjs/legacy";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { OTPInput } from "@/components/ui/otp-input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Loader2, ArrowLeft } from "lucide-react";
import type { EmailCodeFactor } from "@clerk/types";

type SignInStep = "credentials" | "second-factor" | "forgot-email" | "forgot-code" | "forgot-reset";

function getClerkError(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "errors" in err) {
    const errors = (err as { errors: { message: string }[] }).errors;
    return errors?.[0]?.message || fallback;
  }
  return fallback;
}

export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<SignInStep>("credentials");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // ── Credential sign-in ──────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
      } else if (result.status === "needs_second_factor") {
        const emailCodeFactor = result.supportedSecondFactors?.find(
          (factor): factor is EmailCodeFactor => factor.strategy === "email_code",
        );

        if (emailCodeFactor) {
          await signIn.prepareSecondFactor({
            strategy: "email_code",
            emailAddressId: emailCodeFactor.emailAddressId,
          });
          setStep("second-factor");
        } else {
          setError("Required verification method is not available.");
        }
      } else {
        console.error("Sign-in not complete:", result.status);
        setError("Unable to complete sign-in. Please try again.");
      }
    } catch (err: unknown) {
      setError(getClerkError(err, "Invalid email or password."));
    } finally {
      setIsLoading(false);
    }
  };

  // ── 2FA email code ──────────────────────────────────────────────
  const handleEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "email_code",
        code,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
      } else {
        setError("Verification was not complete. Please try again.");
      }
    } catch (err: unknown) {
      setError(getClerkError(err, "Invalid verification code."));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Forgot password: send code ──────────────────────────────────
  const handleForgotSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsLoading(true);
    setError("");

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      setStep("forgot-code");
    } catch (err: unknown) {
      setError(getClerkError(err, "Could not send reset code. Check your email."));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Forgot password: verify code ────────────────────────────────
  const handleForgotVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
      });

      if (result.status === "needs_new_password") {
        setStep("forgot-reset");
        setCode("");
      } else {
        setError("Unexpected state. Please try again.");
      }
    } catch (err: unknown) {
      setError(getClerkError(err, "Invalid code."));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Forgot password: set new password ───────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn.resetPassword({
        password: newPassword,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
      } else {
        setError("Unable to reset password. Please try again.");
      }
    } catch (err: unknown) {
      setError(getClerkError(err, "Password reset failed."));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Google OAuth ────────────────────────────────────────────────
  const handleGoogleAuth = () => {
    if (!isLoaded) return;
    signIn.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: "/sso-callback",
      redirectUrlComplete: "/dashboard",
    });
  };

  const resetToCredentials = () => {
    setStep("credentials");
    setCode("");
    setNewPassword("");
    setError("");
  };

  // ── 2FA View ────────────────────────────────────────────────────
  if (step === "second-factor") {
    return (
      <Card className="w-full shadow-2xl backdrop-blur-3xl border-border">
        <CardHeader className="space-y-1 text-center">
          <div className="w-full flex justify-center mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <Bot className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Verify your identity</CardTitle>
          <CardDescription>
            We sent a verification code to {email}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailCode} className="space-y-4">
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
              Verify
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t pt-6">
          <button
            type="button"
            onClick={resetToCredentials}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </button>
        </CardFooter>
      </Card>
    );
  }

  // ── Forgot Password: Email ──────────────────────────────────────
  if (step === "forgot-email") {
    return (
      <Card className="w-full shadow-2xl backdrop-blur-3xl border-border">
        <CardHeader className="space-y-1 text-center">
          <div className="w-full flex justify-center mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <Bot className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Reset your password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a reset code
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleForgotSendCode} className="space-y-4">
            <Input
              id="forgot-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <p className="text-destructive text-sm font-medium text-center">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !email}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Reset Code
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t pt-6">
          <button
            type="button"
            onClick={resetToCredentials}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </button>
        </CardFooter>
      </Card>
    );
  }

  // ── Forgot Password: Code Verification ──────────────────────────
  if (step === "forgot-code") {
    return (
      <Card className="w-full shadow-2xl backdrop-blur-3xl border-border">
        <CardHeader className="space-y-1 text-center">
          <div className="w-full flex justify-center mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <Bot className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Check your email</CardTitle>
          <CardDescription>
            We sent a reset code to {email}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleForgotVerifyCode} className="space-y-4">
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
              Verify Code
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t pt-6">
          <button
            type="button"
            onClick={resetToCredentials}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </button>
        </CardFooter>
      </Card>
    );
  }

  // ── Forgot Password: New Password ───────────────────────────────
  if (step === "forgot-reset") {
    return (
      <Card className="w-full shadow-2xl backdrop-blur-3xl border-border">
        <CardHeader className="space-y-1 text-center">
          <div className="w-full flex justify-center mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <Bot className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Set new password</CardTitle>
          <CardDescription>
            Choose a strong password for your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <PasswordInput
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            {error && <p className="text-destructive text-sm font-medium text-center">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !newPassword}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Password
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // ── Main Credentials View ───────────────────────────────────────
  return (
    <Card className="w-full shadow-2xl backdrop-blur-3xl border-border">
      <CardHeader className="space-y-1 text-center">
        <div className="w-full flex justify-center mb-2">
          <div className="h-12 w-12 rounded-xl bg-primary border shadow-inner flex items-center justify-center">
            <Bot className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
        <CardDescription>
          Enter your email and password to log in safely
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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

        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <PasswordInput
              id="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep("forgot-email");
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Forgot password?
              </button>
            </div>
          </div>
          {error && <p className="text-destructive text-sm font-medium text-center">{error}</p>}
          <Button 
            type="submit" 
            className="w-full"
            disabled={isLoading || !email || !password}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex justify-center border-t pt-6">
        <div className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="text-foreground font-medium underline-offset-4 hover:underline">
            Sign up
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
