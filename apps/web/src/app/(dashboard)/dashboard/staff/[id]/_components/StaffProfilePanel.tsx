"use client";

import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  staffSchema,
  type AddressInput,
  type StaffFormValues,
} from "@/lib/validations/staff.schema";
import { updateStaff } from "@/server/actions/staff.actions";
import type { StaffAddress, StaffDTO } from "@/types/staff";

interface StaffProfilePanelProps {
  staff: StaffDTO;
  roles: string[];
  stations: string[];
}

type AddressDraft = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
};

type ProfileFormValues = StaffFormValues & {
  address: AddressDraft;
};

const EMPTY_ADDRESS: AddressDraft = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
};

function toAddressDraft(
  address: StaffAddress | null | undefined,
): AddressDraft {
  if (!address) return EMPTY_ADDRESS;
  return {
    line1: address.line1 ?? "",
    line2: address.line2 ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    postalCode: address.postalCode ?? "",
  };
}

/** Blank drafts become `null` so `updateStaff` unsets the address. */
function normalizeAddress(draft: AddressDraft): AddressInput | null {
  const line1 = draft.line1.trim();
  const line2 = draft.line2.trim();
  const city = draft.city.trim();
  const state = draft.state.trim().toUpperCase();
  const postalCode = draft.postalCode.trim();
  if (!line1 && !line2 && !city && !state && !postalCode) return null;
  return {
    line1,
    ...(line2 ? { line2 } : {}),
    city,
    state,
    postalCode,
  };
}

// Draft strings stay on the form so inputs can be empty. Validation runs
// the shared staff schema against the normalized address (`null` when
// every field is blank) and copies those issues onto the draft paths.
const profileFormSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    roles: z.array(z.string()),
    skills: z.array(
      z.object({
        station: z.string(),
        proficiency: z.number(),
      }),
    ),
    isActive: z.boolean(),
    sendInvite: z.boolean().optional(),
    maxHoursPerWeek: z.number().optional(),
    minHoursPerWeek: z.number().optional(),
    preferredStations: z.array(z.string()).optional(),
    certifications: z.array(z.string()).optional(),
    hourlyRate: z.number().optional(),
    address: z.object({
      line1: z.string(),
      line2: z.string(),
      city: z.string(),
      state: z.string(),
      postalCode: z.string(),
    }),
  })
  .superRefine((values, ctx) => {
    const parsed = staffSchema.safeParse({
      ...values,
      address: normalizeAddress(values.address),
    });
    if (parsed.success) return;
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: "custom",
        message: issue.message,
        path: issue.path,
      });
    }
  });

function toFormValues(staff: StaffDTO): ProfileFormValues {
  return {
    name: staff.name,
    email: staff.email,
    phone: staff.phone,
    roles: staff.roles,
    skills: staff.skills,
    isActive: staff.isActive,
    maxHoursPerWeek: staff.maxHoursPerWeek ?? 40,
    minHoursPerWeek: staff.minHoursPerWeek ?? 0,
    hourlyRate: staff.hourlyRate ?? 0,
    preferredStations: staff.preferredStations ?? [],
    address: toAddressDraft(staff.address),
  };
}

export function StaffProfilePanel({
  staff,
  roles,
  stations,
}: StaffProfilePanelProps) {
  const queryClient = useQueryClient();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: toFormValues(staff),
  });

  const {
    fields: skillFields,
    append: appendSkill,
    remove: removeSkill,
  } = useFieldArray({
    control: form.control,
    name: "skills",
  });

  // Re-seed the form whenever the underlying staff record changes (e.g. a
  // skill-change approval on another tab mutates Staff.skills).
  useEffect(() => {
    form.reset(toFormValues(staff));
  }, [staff, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      const result = await updateStaff(staff.id, {
        ...values,
        address: normalizeAddress(values.address),
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      form.reset(toFormValues(data));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const skillStations = skillFields.map((s) => s.station);
  const unusedStations = stations.filter((s) => !skillStations.includes(s));

  const handleAddSkill = () => {
    const next = unusedStations[0];
    if (next) appendSkill({ station: next, proficiency: 3 });
  };

  const watchedPreferredStations = form.watch("preferredStations") ?? [];
  const availablePreferredStations = stations.filter(
    (s) => !watchedPreferredStations.includes(s),
  );

  const handleAddPreferredStation = (station: string) => {
    if (!station || watchedPreferredStations.includes(station)) return;
    form.setValue("preferredStations", [...watchedPreferredStations, station], {
      shouldDirty: true,
    });
  };

  const handleRemovePreferredStation = (station: string) => {
    form.setValue(
      "preferredStations",
      watchedPreferredStations.filter((s) => s !== station),
      { shouldDirty: true },
    );
  };

  const isDirty = form.formState.isDirty;

  const onSubmit = (values: ProfileFormValues) => saveMutation.mutate(values);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Contact & Role */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">
                Contact &amp; Role
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                        disabled={Boolean(staff.clerkUserId)}
                      />
                    </FormControl>
                    {staff.clerkUserId ? (
                      <FormDescription>
                        This person changes their email from their account.
                        The roster updates after they verify the new address.
                      </FormDescription>
                    ) : staff.invitationStatus === "pending" ? (
                      <FormDescription>
                        Changing this email cancels the current app invite.
                      </FormDescription>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <div className="space-y-3 border-t pt-4">
                <div className="space-y-1">                  
                </div>
                <FormField
                  control={form.control}
                  name="address.line1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="123 Main St"
                          autoComplete="street-address"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address.line2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Apt / suite</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Optional"
                          autoComplete="address-line2"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_7rem]">
                  <FormField
                    control={form.control}
                    name="address.city"
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="City"
                            autoComplete="address-level2"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address.state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="NY"
                            maxLength={3}
                            autoComplete="address-level1"
                            {...field}
                            onChange={(event) =>
                              field.onChange(event.target.value.toUpperCase())
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address.postalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="10001"
                            maxLength={10}
                            autoComplete="postal-code"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <FormField
                control={form.control}
                name="roles"
                render={() => (
                  <FormItem>
                    <FormLabel>Roles</FormLabel>
                    {roles.length === 0 ? (
                      <p className="py-2 text-sm text-muted-foreground">
                        No roles configured. Add roles in Settings.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {roles.map((role) => (
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
                                            (r) => r !== role,
                                          );
                                      field.onChange(updated);
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="cursor-pointer text-sm font-normal">
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
            </CardContent>
          </Card>

          {/* Skills */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg font-medium">Skills</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSkill}
                disabled={unusedStations.length === 0}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Skill
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {skillFields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {stations.length === 0
                    ? "No stations configured. Add stations in Settings."
                    : 'No skills assigned yet. Click "Add Skill" to assign stations.'}
                </p>
              )}

              {skillFields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-center gap-3 rounded-md border bg-muted/30 p-3"
                >
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
                          <span className="min-w-18 text-right text-sm font-medium text-yellow-500">
                            {"★".repeat(profField.value)}
                          </span>
                        </div>
                      </FormItem>
                    )}
                  />
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
            </CardContent>
          </Card>
        </div>

        {/* Scheduling constraints */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              Scheduling Constraints
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="minHoursPerWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Hours/Week</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={168}
                        value={field.value ?? 0}
                        onChange={(e) =>
                          field.onChange(Number(e.target.value) || 0)
                        }
                        onBlur={field.onBlur}
                        name={field.name}
                      />
                    </FormControl>
                    <FormDescription>Minimum guaranteed hours</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxHoursPerWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Hours/Week</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={168}
                        value={field.value ?? 40}
                        onChange={(e) =>
                          field.onChange(Number(e.target.value) || 0)
                        }
                        onBlur={field.onBlur}
                        name={field.name}
                      />
                    </FormControl>
                    <FormDescription>Maximum allowed hours</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hourlyRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hourly Rate ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={field.value ?? 0}
                        onChange={(e) =>
                          field.onChange(Number(e.target.value) || 0)
                        }
                        onBlur={field.onBlur}
                        name={field.name}
                      />
                    </FormControl>
                    <FormDescription>For labor cost tracking</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="preferredStations"
              render={() => (
                <FormItem>
                  <FormLabel>Preferred Stations</FormLabel>
                  <div className="space-y-3">
                    <div className="flex min-h-8 flex-wrap gap-2">
                      {watchedPreferredStations.length === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          No preferred stations selected
                        </span>
                      ) : (
                        watchedPreferredStations.map((station) => (
                          <Badge
                            key={station}
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            {station}
                            <button
                              type="button"
                              onClick={() =>
                                handleRemovePreferredStation(station)
                              }
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))
                      )}
                    </div>
                    {availablePreferredStations.length > 0 && (
                      <Select
                        value=""
                        onValueChange={handleAddPreferredStation}
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Add a preferred station..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePreferredStations.map((station) => (
                            <SelectItem key={station} value={station}>
                              {station}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <FormDescription>
                    Stations this staff member prefers to work (used by AI
                    scheduling).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Sticky save bar */}
        <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-lg border bg-background/80 px-4 py-3 shadow-sm backdrop-blur">
          <span className="text-sm text-muted-foreground">
            {isDirty ? "You have unsaved changes" : "All changes saved"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset(toFormValues(staff))}
              disabled={!isDirty || saveMutation.isPending}
            >
              Discard
            </Button>
            <Button type="submit" disabled={!isDirty || saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save changes
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
