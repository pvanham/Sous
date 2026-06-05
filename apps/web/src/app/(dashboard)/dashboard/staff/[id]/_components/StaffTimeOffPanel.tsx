"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

import { createTimeOffRequestSchema } from "@/lib/validations/time-off-request.schema";
import {
  createTimeOffRequest,
  deleteTimeOffRequest,
  getTimeOffRequestsByStaff,
  updateTimeOffRequestStatus,
} from "@/server/actions/time-off-request.actions";
import type {
  TimeOffRequestDTO,
  TimeOffRequestType,
} from "@/types/time-off-request";

type StatusFilter = "all" | "pending" | "approved" | "denied";

const TYPE_LABELS: Record<TimeOffRequestType, string> = {
  pto: "PTO",
  sick: "Sick",
  unpaid: "Unpaid",
};

function getStatusBadgeVariant(
  status: string,
): "outline" | "default" | "destructive" {
  switch (status) {
    case "approved":
      return "default";
    case "denied":
      return "destructive";
    default:
      return "outline";
  }
}

interface StaffTimeOffPanelProps {
  staffId: string;
  staffName: string;
  initialRequests: TimeOffRequestDTO[];
  minAdvanceDays: number;
}

const timeOffKeys = {
  byStaff: (staffId: string) => ["timeOffRequests", "staff", staffId] as const,
};

export function StaffTimeOffPanel({
  staffId,
  staffName,
  initialRequests,
  minAdvanceDays,
}: StaffTimeOffPanelProps) {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewRequest, setReviewRequest] = useState<TimeOffRequestDTO | null>(
    null,
  );
  const [deleteRequest, setDeleteRequest] = useState<TimeOffRequestDTO | null>(
    null,
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: timeOffKeys.byStaff(staffId) });

  const { data: requests = initialRequests, isLoading } = useQuery({
    queryKey: timeOffKeys.byStaff(staffId),
    queryFn: async () => {
      const result = await getTimeOffRequestsByStaff({ staffId });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: initialRequests,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTimeOffRequest(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Time-off request deleted");
      invalidate();
      setDeleteRequest(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const sorted = [...requests].sort(
      (a, b) =>
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );
    if (statusFilter === "all") return sorted;
    return sorted.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  return (
    <Card>
      <CardHeader className="flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="text-lg font-medium">Time Off</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and manage {staffName}&apos;s time-off requests.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="denied">Denied</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Request
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <h3 className="text-lg font-medium">No time-off requests</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {statusFilter !== "all"
                ? `No ${statusFilter} requests found.`
                : "This staff member has no time-off requests yet."}
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      {format(new Date(request.startDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      {format(new Date(request.endDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {TYPE_LABELS[request.type] ?? "PTO"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="block truncate">
                        {request.reason || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(request.status)}>
                        {request.status.charAt(0).toUpperCase() +
                          request.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReviewRequest(request)}
                        >
                          {request.status === "pending" ? "Review" : "View"}
                        </Button>
                        {request.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            title="Delete"
                            onClick={() => setDeleteRequest(request)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CreateStaffTimeOffDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        staffId={staffId}
        minAdvanceDays={minAdvanceDays}
        onCreated={invalidate}
      />

      <ReviewStaffTimeOffDialog
        request={reviewRequest}
        onOpenChange={(open) => {
          if (!open) setReviewRequest(null);
        }}
        onReviewed={invalidate}
      />

      <AlertDialog
        open={!!deleteRequest}
        onOpenChange={(open) => {
          if (!open) setDeleteRequest(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete time-off request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this time-off request? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteRequest) deleteMutation.mutate(deleteRequest.id);
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  minAdvanceDays: number;
  onCreated: () => void;
}

function CreateStaffTimeOffDialog({
  open,
  onOpenChange,
  staffId,
  minAdvanceDays,
  onCreated,
}: CreateDialogProps) {
  const minDate = useMemo(
    () => format(addDays(new Date(), minAdvanceDays), "yyyy-MM-dd"),
    [minAdvanceDays],
  );

  const form = useForm({
    resolver: zodResolver(createTimeOffRequestSchema),
    defaultValues: {
      staffId,
      startDate: "",
      endDate: "",
      type: "pto" as TimeOffRequestType,
      reason: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        staffId,
        startDate: "",
        endDate: "",
        type: "pto",
        reason: "",
      });
    }
  }, [open, staffId, form]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const result = await createTimeOffRequest({ ...data, staffId });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Time-off request created");
      onCreated();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New time-off request</DialogTitle>
          <DialogDescription>
            Submit a time-off request for this staff member.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) =>
              createMutation.mutate(data as Record<string, unknown>),
            )}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={String(field.value ?? "")}
                        min={minDate}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={String(field.value ?? "")}
                        min={minDate}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pto">PTO</SelectItem>
                      <SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Reason{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Vacation, doctor appointment, etc."
                      maxLength={500}
                      className="min-h-[80px] resize-y"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface ReviewDialogProps {
  request: TimeOffRequestDTO | null;
  onOpenChange: (open: boolean) => void;
  onReviewed: () => void;
}

function ReviewStaffTimeOffDialog({
  request,
  onOpenChange,
  onReviewed,
}: ReviewDialogProps) {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    // Pre-populate notes for already-reviewed requests; reset for pending.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes(
      request && request.status !== "pending" ? (request.notes ?? "") : "",
    );
  }, [request]);

  const reviewMutation = useMutation({
    mutationFn: async (status: "approved" | "denied") => {
      if (!request) return;
      const result = await updateTimeOffRequestStatus({
        requestId: request.id,
        status,
        notes: notes || undefined,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_data, status) => {
      toast.success(`Time-off request ${status}`);
      onReviewed();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!request) return null;

  const statusLabel =
    request.status.charAt(0).toUpperCase() + request.status.slice(1);

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Review time-off request</DialogTitle>
          <DialogDescription>
            {request.status === "pending"
              ? "Approve or deny this time-off request."
              : "View or update this time-off request."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Status</span>
              <div>
                <Badge variant={getStatusBadgeVariant(request.status)}>
                  {statusLabel}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Type</span>
              <p className="font-medium">{TYPE_LABELS[request.type] ?? "PTO"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Start date</span>
              <p className="font-medium">
                {format(new Date(request.startDate), "MMM d, yyyy")}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">End date</span>
              <p className="font-medium">
                {format(new Date(request.endDate), "MMM d, yyyy")}
              </p>
            </div>
          </div>

          {request.reason && (
            <div className="text-sm">
              <span className="text-muted-foreground">Reason</span>
              <p className="font-medium">{request.reason}</p>
            </div>
          )}

          <div className="pt-2">
            <Label htmlFor="review-notes">Notes (optional)</Label>
            <Textarea
              id="review-notes"
              placeholder="Add a note..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              className="mt-1.5 min-h-[80px] resize-y"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-4 sm:gap-0">
          <Button
            type="button"
            variant="destructive"
            onClick={() => reviewMutation.mutate("denied")}
            disabled={reviewMutation.isPending || request.status === "denied"}
            className="mr-auto"
          >
            {reviewMutation.isPending &&
            reviewMutation.variables === "denied" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <X className="mr-2 h-4 w-4" />
            )}
            Deny
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={reviewMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => reviewMutation.mutate("approved")}
            disabled={reviewMutation.isPending || request.status === "approved"}
          >
            {reviewMutation.isPending &&
            reviewMutation.variables === "approved" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
