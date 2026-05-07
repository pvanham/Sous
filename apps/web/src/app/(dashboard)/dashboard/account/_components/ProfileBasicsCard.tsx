"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ProfileImageDialog } from "@/components/shared/ProfileImageDialog";
import { nameSchema, type NameInput } from "@/lib/validations/account";

import { clerkErrorMessage } from "./clerk-error";

export function ProfileBasicsCard() {
  const { isLoaded, user } = useUser();
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<NameInput>({
    resolver: zodResolver(nameSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
    },
  });

  // `useUser` hydrates after first render — sync defaults once Clerk
  // delivers the resource so the inputs reflect the current values.
  useEffect(() => {
    if (!user) return;
    form.reset({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
    });
  }, [form, user]);

  const onSubmit = async (values: NameInput) => {
    if (!user) return;
    setSubmitting(true);
    try {
      await user.update({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
      });
      await user.reload();
      toast.success("Profile updated.");
      form.reset({
        firstName: user.firstName ?? values.firstName.trim(),
        lastName: user.lastName ?? values.lastName.trim(),
      });
    } catch (err) {
      toast.error(clerkErrorMessage(err, "Could not update your profile."));
    } finally {
      setSubmitting(false);
    }
  };

  const initials =
    user
      ? `${user.firstName?.charAt(0) ?? ""}${user.lastName?.charAt(0) ?? ""}` ||
        "U"
      : "U";

  const isDirty = form.formState.isDirty;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Your name and photo appear next to you across schedules,
            rosters, and chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 border border-stone-300 dark:border-white/10">
              <AvatarImage
                src={user?.imageUrl}
                alt={user?.fullName ?? "Profile picture"}
              />
              <AvatarFallback className="bg-stone-900 text-stone-50 dark:bg-white dark:text-stone-900 text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImageDialogOpen(true)}
                disabled={!isLoaded}
              >
                <Camera className="mr-2 h-4 w-4" />
                {user?.hasImage ? "Change picture" : "Upload picture"}
              </Button>
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, WEBP, or GIF. 10 MB max.
              </p>
            </div>
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input
                          autoComplete="given-name"
                          disabled={submitting || !isLoaded}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input
                          autoComplete="family-name"
                          disabled={submitting || !isLoaded}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    form.reset({
                      firstName: user?.firstName ?? "",
                      lastName: user?.lastName ?? "",
                    })
                  }
                  disabled={submitting || !isDirty}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || !isDirty || !isLoaded}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <ProfileImageDialog
        open={imageDialogOpen}
        onOpenChange={setImageDialogOpen}
      />
    </>
  );
}
