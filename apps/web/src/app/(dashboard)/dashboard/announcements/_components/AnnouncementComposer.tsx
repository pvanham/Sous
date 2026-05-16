"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import {
  createAnnouncement,
  updateAnnouncement,
} from "@/server/actions/announcement.actions";
import {
  createAnnouncementSchema,
  type CreateAnnouncementInput,
} from "@/lib/validations/announcement.schema";
import { composerDefaultValues } from "@/lib/announcement/composer-defaults";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { AttachmentDropzone } from "./AttachmentDropzone";
import { AudienceSelector } from "./AudienceSelector";
import { PriorityToggle } from "./PriorityToggle";
import { PublishWindowFields } from "./PublishWindowFields";
import { TiptapEditor } from "./TiptapEditor";
import { TagInput } from "./TagInput";

export type AnnouncementComposerMode =
  | { kind: "create" }
  | { kind: "edit"; announcementId: string };

type AnnouncementComposerProps = {
  mode: AnnouncementComposerMode;
  initialValues?: Partial<CreateAnnouncementInput>;
  initialAvailableRoles: string[];
  initialManagerRoles: string[];
};

export function AnnouncementComposer({
  mode,
  initialValues,
  initialAvailableRoles,
  initialManagerRoles,
}: AnnouncementComposerProps) {
  const router = useRouter();

  const form = useForm<CreateAnnouncementInput>({
    resolver: zodResolver(
      createAnnouncementSchema
    ) as Resolver<CreateAnnouncementInput>,
    defaultValues: {
      ...composerDefaultValues(),
      ...initialValues,
    },
    mode: "onBlur",
  });

  const upsertMutation = useMutation({
    mutationFn: async (values: CreateAnnouncementInput) => {
      if (mode.kind === "create") {
        const result = await createAnnouncement(values);
        if (!result.success) {
          throw new Error(result.error || "Failed to create announcement");
        }
        return result.data;
      }

      const result = await updateAnnouncement({
        ...values,
        announcementId: mode.announcementId,
      });
      if (!result.success) {
        throw new Error(result.error || "Failed to update announcement");
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success(
        mode.kind === "create" ? "Announcement created" : "Announcement updated"
      );
      router.push("/dashboard/announcements");
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (values: CreateAnnouncementInput) => {
    upsertMutation.mutate(values);
  };

  useEffect(() => {
    const currentAudience = form.getValues("targetAudience");
    if (currentAudience.length > 0) {
      return;
    }

    if (initialAvailableRoles.length === 0 && initialManagerRoles.length === 0) {
      form.setValue("targetAudience", ["@everyone"], {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: true,
      });
    }
  }, [form, initialAvailableRoles.length, initialManagerRoles.length]);

  const watchedAudience = useWatch({
    control: form.control,
    name: "targetAudience",
  });
  const hasValidAudience = (watchedAudience?.length ?? 0) > 0;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-20">
        <div className="space-y-6 lg:col-span-13">
          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
              <CardDescription>
                Write the message your team will see.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g. Friday dinner rush prep update"
                        maxLength={120}
                        disabled={upsertMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Body</FormLabel>
                    <FormControl>
                      <TiptapEditor
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={upsertMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <TagInput
                        value={field.value ?? []}
                        onChange={field.onChange}
                        disabled={upsertMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="attachments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attachments</FormLabel>
                    <FormControl>
                      <AttachmentDropzone
                        value={field.value ?? []}
                        onChange={field.onChange}
                        disabled={upsertMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle>Logistics</CardTitle>
              <CardDescription>
                Control urgency and publish timing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <FormControl>
                      <PriorityToggle
                        value={field.value}
                        onChange={field.onChange}
                        disabled={upsertMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <PublishWindowFields
                control={form.control}
                disabled={upsertMutation.isPending}
              />

              <FormField
                control={form.control}
                name="requiresAcknowledgment"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Require acknowledgment</FormLabel>
                      <FormDescription className="text-xs">
                        Staff must explicitly confirm they have read this announcement.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={upsertMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <FormField
            control={form.control}
            name="targetAudience"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <AudienceSelector
                    value={field.value ?? []}
                    onChange={field.onChange}
                    disabled={upsertMutation.isPending}
                    initialAvailableRoles={initialAvailableRoles}
                    initialManagerRoles={initialManagerRoles}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Card className="sticky bottom-4">
            <CardContent className="pt-6">
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={upsertMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={upsertMutation.isPending || !hasValidAudience}>
                  {upsertMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {upsertMutation.isPending
                    ? mode.kind === "create"
                      ? "Saving..."
                      : "Updating..."
                    : mode.kind === "create"
                      ? "Save announcement"
                      : "Update announcement"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </Form>
  );
}
