"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { 
  inviteManagerSchema, 
  type InviteManagerInput 
} from "@/lib/validations/invitation.schema";
import { inviteManager } from "@/server/actions/invitation.actions";
import type { LocationDTO } from "@/types/location";

import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InviteManagerFormProps {
  locations: LocationDTO[];
}

export function InviteManagerForm({ locations }: InviteManagerFormProps) {
  const [isPending, setIsPending] = useState(false);

  const form = useForm<InviteManagerInput>({
    resolver: zodResolver(inviteManagerSchema),
    defaultValues: {
      email: "",
      locationId: "",
    },
  });

  async function onSubmit(data: InviteManagerInput) {
    setIsPending(true);
    try {
      const result = await inviteManager(data);
      
      if (result.success) {
        toast.success(`Invitation sent to ${result.data.emailAddress}`);
        form.reset();
      } else {
        toast.error(result.error);
      }
    } catch (e) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-stone-200 dark:border-white/10 p-6">
      <h2 className="text-lg font-semibold mb-4">Invite a Manager</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-md">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input placeholder="manager@example.com" {...field} disabled={isPending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="locationId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assign to Location</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a location..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="org-wide">All Locations (Org-Wide)</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Managers with Org-Wide access can see and manage all locations. Location-specific managers are restricted to their assigned kitchen.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending}>
            {isPending ? "Sending Invite..." : "Send Invitation"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
