"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import { createAnnouncement } from "@/server/actions/announcement.actions";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import { AttachmentDropzone } from "./AttachmentDropzone";
import { AudienceSelector } from "./AudienceSelector";
import { PriorityToggle } from "./PriorityToggle";
import { PublishWindowFields } from "./PublishWindowFields";
import { RichTextEditorPlaceholder } from "./RichTextEditorPlaceholder";
import { TagInput } from "./TagInput";

/**
 * Phase 3 — Announcement Composer
 * TODO(Phase 4): Replace /dashboard redirect with /dashboard/announcements.
 */
type AnnouncementComposerProps = {
  initialAvailableRoles: string[];
  initialManagerRoles: string[];
};

export function AnnouncementComposer({
  initialAvailableRoles,
  initialManagerRoles,
}: AnnouncementComposerProps) {
  const router = useRouter();

  const form = useForm<CreateAnnouncementInput>({
    resolver: zodResolver(
      createAnnouncementSchema
    ) as Resolver<CreateAnnouncementInput>,
    defaultValues: composerDefaultValues(),
    mode: "onBlur",
  });

  const createMutation = useMutation({
    mutationFn: async (values: CreateAnnouncementInput) => {
      const result = await createAnnouncement(values);
      if (!result.success) {
        throw new Error(result.error || "Failed to create announcement");
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Announcement created");
      router.push("/dashboard");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (values: CreateAnnouncementInput) => {
    createMutation.mutate(values);
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
                        disabled={createMutation.isPending}
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
                      <RichTextEditorPlaceholder
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={createMutation.isPending}
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
                        disabled={createMutation.isPending}
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
                        disabled={createMutation.isPending}
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
                        disabled={createMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <PublishWindowFields
                control={form.control}
                disabled={createMutation.isPending}
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
                    disabled={createMutation.isPending}
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
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || !hasValidAudience}>
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {createMutation.isPending ? "Saving..." : "Save announcement"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </Form>
  );
}
