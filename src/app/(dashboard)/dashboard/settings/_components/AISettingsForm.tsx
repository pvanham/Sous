"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  aiSettingsSchema,
  type AISettingsInput,
} from "@/lib/validations/kitchen-config.schema";
import { saveAISettings } from "@/server/actions/kitchen-config.actions";
import type { AISettingsDTO } from "@/types/kitchen-config";

const defaultValues: AISettingsInput = {
  monthlyGenerationLimit: 50,
  subscriptionTier: "free",
};

interface AISettingsFormProps {
  initialSettings: AISettingsDTO | null;
}

export function AISettingsForm({ initialSettings }: AISettingsFormProps) {
  const queryClient = useQueryClient();

  const form = useForm<AISettingsInput>({
    resolver: zodResolver(aiSettingsSchema),
    defaultValues: initialSettings ?? defaultValues,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: AISettingsInput) => {
      const result = await saveAISettings(data);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("AI settings saved successfully!");
      queryClient.invalidateQueries({ queryKey: ["kitchenConfig"] });
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to save AI settings");
    },
  });

  const onSubmit = (data: AISettingsInput) => {
    saveMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="monthlyGenerationLimit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Monthly Generation Limit</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={field.value}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const num = raw === "" ? 1 : parseInt(raw, 10);
                    field.onChange(isNaN(num) ? 1 : num);
                  }}
                />
              </FormControl>
              <FormDescription>
                Number of AI schedule generations allowed per month
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="subscriptionTier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subscription Tier</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save AI Settings"}
        </Button>
      </form>
    </Form>
  );
}
