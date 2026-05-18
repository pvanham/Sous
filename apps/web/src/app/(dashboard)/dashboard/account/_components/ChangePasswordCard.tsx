"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  changePasswordSchema,
  setPasswordSchema,
  type ChangePasswordInput,
  type SetPasswordInput,
} from "@/lib/validations/account";

import { clerkErrorMessage } from "./clerk-error";

export function ChangePasswordCard() {
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return user?.passwordEnabled ? <ChangeForm /> : <SetForm />;
}

function ChangeForm() {
  const { user } = useUser();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      signOutOfOtherSessions: true,
    },
  });

  const onSubmit = async (values: ChangePasswordInput) => {
    if (!user) return;
    setSubmitting(true);
    try {
      await user.updatePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        signOutOfOtherSessions: values.signOutOfOtherSessions,
      });
      toast.success(
        values.signOutOfOtherSessions
          ? "Password updated. Other sessions have been signed out."
          : "Password updated.",
      );
      form.reset({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        signOutOfOtherSessions: values.signOutOfOtherSessions,
      });
    } catch (err) {
      const message = clerkErrorMessage(
        err,
        "Could not update your password.",
      );
      toast.error(message);
      form.setError("currentPassword", { message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Use a strong password you don&apos;t reuse anywhere else. Updating
          can sign out your other devices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="current-password"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="new-password"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Minimum 8 characters.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="new-password"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="signOutOfOtherSessions"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        id="sign-out-others"
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                        disabled={submitting}
                      />
                    </FormControl>
                    <Label
                      htmlFor="sign-out-others"
                      className="font-normal text-sm"
                    >
                      Sign out of all other devices after changing my
                      password
                    </Label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating…
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Update password
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function SetForm() {
  const { user } = useUser();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values: SetPasswordInput) => {
    if (!user) return;
    setSubmitting(true);
    try {
      await user.updatePassword({
        newPassword: values.newPassword,
        signOutOfOtherSessions: true,
      });
      await user.reload();
      toast.success(
        "Password set. You can now sign in with email and password.",
      );
      form.reset({ newPassword: "", confirmPassword: "" });
    } catch (err) {
      const message = clerkErrorMessage(err, "Could not set your password.");
      toast.error(message);
      form.setError("newPassword", { message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a password</CardTitle>
        <CardDescription>
          You signed up using a connected account. Add a password if you
          also want to sign in directly with email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="new-password"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Minimum 8 characters.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="new-password"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Set password
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
