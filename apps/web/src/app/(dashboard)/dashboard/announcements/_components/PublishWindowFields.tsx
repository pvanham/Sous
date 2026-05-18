"use client";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Control } from "react-hook-form";
import { format } from "date-fns";
import type { CreateAnnouncementInput } from "@/lib/validations/announcement.schema";

type PublishWindowFieldsProps = {
  control: Control<CreateAnnouncementInput>;
  disabled?: boolean;
};

export function PublishWindowFields({
  control,
  disabled = false,
}: PublishWindowFieldsProps) {
  const toDateTimeLocalValue = (value: Date | null | undefined): string =>
    value ? format(value, "yyyy-MM-dd'T'HH:mm") : "";

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="publishDate"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between gap-3">
              <FormLabel>Publish date &amp; time</FormLabel>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || !field.value}
                onClick={() => field.onChange(null)}
              >
                Clear
              </Button>
            </div>
            <FormControl>
              <Input
                type="datetime-local"
                disabled={disabled}
                value={toDateTimeLocalValue(field.value)}
                className="font-mono tabular-nums"
                onChange={(event) => {
                  const next = event.target.value;
                  field.onChange(next.length === 0 ? null : new Date(next));
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="expirationDate"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between gap-3">
              <FormLabel>Expiration date &amp; time</FormLabel>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || !field.value}
                onClick={() => field.onChange(null)}
              >
                Clear
              </Button>
            </div>
            <FormControl>
              <Input
                type="datetime-local"
                disabled={disabled}
                value={toDateTimeLocalValue(field.value)}
                className="font-mono tabular-nums"
                onChange={(event) => {
                  const next = event.target.value;
                  field.onChange(next.length === 0 ? null : new Date(next));
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
