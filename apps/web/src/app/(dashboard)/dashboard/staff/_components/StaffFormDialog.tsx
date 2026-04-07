"use client";

import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Form,
  FormControl,
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

import { staffSchema, type StaffInput, type StaffFormValues } from "@/lib/validations/staff.schema";
import { createStaff, updateStaff } from "@/server/actions/staff.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import type { StaffDTO } from "@/types/staff";

interface StaffFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: StaffDTO; // If provided, edit mode
}

export function StaffFormDialog({
  open,
  onOpenChange,
  staff,
}: StaffFormDialogProps) {
  const isEditMode = !!staff;
  const queryClient = useQueryClient();

  // Fetch kitchen config for roles/stations
  // Uses same pattern as ShiftFormDialog for consistency
  const { data: configResponse, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["kitchenConfig"],
    queryFn: () => getKitchenConfig(),
    enabled: open,
  });

  // Extract config data from response
  const configResult = configResponse?.success ? configResponse.data : null;
  const availableRoles = configResult?.roles ?? [];
  const availableStations = configResult?.stations ?? [];

  // Refetch kitchen config when dialog opens to ensure fresh data
  useEffect(() => {
    if (open) {
      queryClient.invalidateQueries({ queryKey: ["kitchenConfig"] });
    }
  }, [open, queryClient]);

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      roles: [],
      skills: [],
      isActive: true,
    },
  });

  const { fields: skillFields, append: appendSkill, remove: removeSkill } = useFieldArray({
    control: form.control,
    name: "skills",
  });

  // Reset form when dialog opens/closes or staff changes
  useEffect(() => {
    if (open) {
      if (staff) {
        form.reset({
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          roles: staff.roles,
          skills: staff.skills,
          isActive: staff.isActive,
        });
      } else {
        form.reset({
          name: "",
          email: "",
          phone: "",
          roles: [],
          skills: [],
          isActive: true,
        });
      }
    }
  }, [open, staff, form]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: StaffFormValues) => {
      // Cast to StaffInput for server action compatibility
      const result = await createStaff(data as StaffInput);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Staff member created successfully");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: StaffFormValues) => {
      // Cast to StaffInput for server action compatibility
      const result = await updateStaff(staff!.id, data as StaffInput);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Staff member updated successfully");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (data: StaffFormValues) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleAddSkill = () => {
    if (availableStations.length > 0) {
      // Find a station not already added
      const usedStations = skillFields.map((s) => s.station);
      const availableStation = availableStations.find(
        (s) => !usedStations.includes(s)
      );
      if (availableStation) {
        appendSkill({ station: availableStation, proficiency: 3 });
      }
    }
  };

  // Get stations that are not yet used in skills
  const unusedStations = availableStations.filter(
    (s) => !skillFields.map((skill) => skill.station).includes(s)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Staff Member" : "Add Staff Member"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the staff member's information."
              : "Add a new staff member to your team."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Smith" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Phone */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="555-123-4567" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Roles */}
            <FormField
              control={form.control}
              name="roles"
              render={() => (
                <FormItem>
                  <FormLabel>Roles</FormLabel>
                  {isLoadingConfig ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Loading roles...
                      </span>
                    </div>
                  ) : availableRoles.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No roles configured. Add roles in Settings.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {availableRoles.map((role) => (
                        <FormField
                          key={role}
                          control={form.control}
                          name="roles"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(role)}
                                  onCheckedChange={(checked) => {
                                    const updated = checked
                                      ? [...(field.value || []), role]
                                      : (field.value || []).filter(
                                          (r) => r !== role
                                        );
                                    field.onChange(updated);
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal cursor-pointer">
                                {role}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Skills */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Skills
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSkill}
                  disabled={isLoadingConfig || unusedStations.length === 0}
                >
                  {isLoadingConfig ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-1" />
                  )}
                  Add Skill
                </Button>
              </div>

              {isLoadingConfig ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Loading stations...
                  </span>
                </div>
              ) : skillFields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {availableStations.length === 0
                    ? "No stations configured. Add stations in Settings."
                    : "No skills added yet. Click \"Add Skill\" to assign stations."}
                </p>
              )}

              {skillFields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-center gap-3 p-3 rounded-md border bg-muted/30"
                >
                  {/* Station Select */}
                  <FormField
                    control={form.control}
                    name={`skills.${index}.station`}
                    render={({ field: stationField }) => (
                      <FormItem className="flex-1">
                        <Select
                          value={stationField.value}
                          onValueChange={stationField.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select station" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Show current station and unused stations */}
                            {[stationField.value, ...unusedStations]
                              .filter(Boolean)
                              .filter((v, i, arr) => arr.indexOf(v) === i)
                              .map((station) => (
                                <SelectItem key={station} value={station}>
                                  {station}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {/* Proficiency Slider */}
                  <FormField
                    control={form.control}
                    name={`skills.${index}.proficiency`}
                    render={({ field: profField }) => (
                      <FormItem className="flex-1">
                        <div className="flex items-center gap-2">
                          <Slider
                            min={1}
                            max={5}
                            step={1}
                            value={[profField.value]}
                            onValueChange={(value) =>
                              profField.onChange(value[0])
                            }
                            className="flex-1"
                          />
                          <span className="text-sm font-medium min-w-18 text-right">
                            {"★".repeat(profField.value)}
                          </span>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* Remove Button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSkill(index)}
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditMode ? "Save Changes" : "Add Staff"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
