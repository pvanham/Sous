"use client";

import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createStaff,
  importStaffFromCSV,
} from "@/server/actions/staff.actions";
import { inviteStaffToApp } from "@/server/actions/invitation.actions";

type InviteRow = {
  name: string;
  email: string;
  phone: string;
  role: string;
};

type StepTeamInvitesProps = {
  roles: string[];
  onBackAction: () => void;
  onFinishAction: () => Promise<void>;
};

const manualInviteRowSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  phone: z
    .string()
    .regex(/^\+?[\d\s\-().]{7,20}$/, "Enter a valid phone number")
    .or(z.literal("")),
});

function downloadTemplate() {
  const csv =
    "name,email,phone,roles,skills\nJane Doe,jane@example.com,5551234567,Cook,Grill:4";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "staff-import-template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function StepTeamInvites({
  roles,
  onBackAction,
  onFinishAction,
}: StepTeamInvitesProps) {
  const [rows, setRows] = useState<InviteRow[]>([
    {
      name: "",
      email: "",
      phone: "",
      role: roles[0] || "",
    },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [manualRowErrors, setManualRowErrors] = useState<
    Record<number, string[]>
  >({});

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        name: "",
        email: "",
        phone: "",
        role: roles[0] || "",
      },
    ]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, current) => current !== index));
    setManualRowErrors((prev) => {
      const next: Record<number, string[]> = {};
      for (const [key, value] of Object.entries(prev)) {
        const numericKey = Number(key);
        if (numericKey < index) {
          next[numericKey] = value;
        } else if (numericKey > index) {
          next[numericKey - 1] = value;
        }
      }
      return next;
    });
  };

  const validateManualRows = (): boolean => {
    const nextErrors: Record<number, string[]> = {};

    rows.forEach((row, index) => {
      const hasAnyValue = Boolean(
        row.name || row.email || row.phone || row.role,
      );
      if (!hasAnyValue) {
        return;
      }

      const rowMessages: string[] = [];
      if (!row.name.trim()) {
        rowMessages.push("Name is required");
      }
      if (!row.role.trim()) {
        rowMessages.push("Role is required");
      }

      const parsed = manualInviteRowSchema.safeParse({
        email: row.email.trim(),
        phone: row.phone.trim(),
      });
      if (!parsed.success) {
        rowMessages.push(...parsed.error.issues.map((issue) => issue.message));
      }

      if (rowMessages.length > 0) {
        nextErrors[index] = [...new Set(rowMessages)];
      }
    });

    setManualRowErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submitManualInvites = async () => {
    if (!validateManualRows()) {
      throw new Error("Please fix validation errors before continuing");
    }

    const validRows = rows.filter((row) => row.name && row.email && row.role);
    if (validRows.length === 0) {
      await onFinishAction();
      return;
    }

    for (const row of validRows) {
      const created = await createStaff({
        name: row.name,
        email: row.email,
        phone: row.phone || "5551234567",
        roles: [row.role],
        skills: [],
        isActive: true,
        sendInvite: false,
      });
      if (!created.success) {
        throw new Error(created.error);
      }

      const invited = await inviteStaffToApp({ staffId: created.data.id });
      if (!invited.success) {
        throw new Error(invited.error);
      }
    }

    toast.success(`Sent ${validRows.length} invite(s)`);
    await onFinishAction();
  };

  const submitCsv = async () => {
    if (!csvFile) {
      await onFinishAction();
      return;
    }

    const text = await csvFile.text();
    const [headerLine, ...bodyLines] = text.split(/\r?\n/).filter(Boolean);
    if (!headerLine) {
      throw new Error("CSV file is empty");
    }

    const headers = headerLine
      .split(",")
      .map((value) => value.trim().toLowerCase());
    const headerIndex = (name: string) => headers.indexOf(name);
    const nameIndex = headerIndex("name");
    const emailIndex = headerIndex("email");
    const phoneIndex = headerIndex("phone");
    const roleIndex = headerIndex("roles");
    if (nameIndex < 0 || emailIndex < 0 || roleIndex < 0) {
      throw new Error("CSV must include name, email, and roles columns");
    }

    const rowsToImport = bodyLines.map((line) => {
      const cells = line.split(",").map((value) => value.trim());
      const role = cells[roleIndex] || roles[0] || "Team Member";
      return {
        name: cells[nameIndex] || "",
        email: cells[emailIndex] || "",
        phone:
          phoneIndex >= 0 ? cells[phoneIndex] || "5551234567" : "5551234567",
        roles: [role],
        skills: [],
      };
    });

    const result = await importStaffFromCSV(rowsToImport);
    if (!result.success) {
      throw new Error(result.error);
    }

    toast.success(
      `Imported ${result.data.inserted} new staff and updated ${result.data.updated}.`,
    );
    await onFinishAction();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Build the Team</h2>
        <p className="text-sm text-muted-foreground">
          Invite now or skip and do it later from Settings.
        </p>
      </div>

      <Tabs defaultValue="manual" className="w-full">
        <TabsList>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Upload</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-3 pt-2">
          {rows.map((row, index) => (
            <div key={`row-${index}`} className="space-y-2">
              <div className="grid gap-2 md:grid-cols-5">
                <Input
                  value={row.name}
                  onChange={(event) => {
                    setManualRowErrors((prev) => {
                      if (!(index in prev)) return prev;
                      const next = { ...prev };
                      delete next[index];
                      return next;
                    });
                    setRows((prev) =>
                      prev.map((value, current) =>
                        current === index
                          ? { ...value, name: event.target.value }
                          : value,
                      ),
                    );
                  }}
                  placeholder="Name"
                />
                <Input
                  type="email"
                  value={row.email}
                  onChange={(event) => {
                    setManualRowErrors((prev) => {
                      if (!(index in prev)) return prev;
                      const next = { ...prev };
                      delete next[index];
                      return next;
                    });
                    setRows((prev) =>
                      prev.map((value, current) =>
                        current === index
                          ? { ...value, email: event.target.value }
                          : value,
                      ),
                    );
                  }}
                  placeholder="Email"
                />
                <Input
                  type="tel"
                  value={row.phone}
                  onChange={(event) => {
                    setManualRowErrors((prev) => {
                      if (!(index in prev)) return prev;
                      const next = { ...prev };
                      delete next[index];
                      return next;
                    });
                    setRows((prev) =>
                      prev.map((value, current) =>
                        current === index
                          ? { ...value, phone: event.target.value }
                          : value,
                      ),
                    );
                  }}
                  placeholder="Phone"
                />
                <Select
                  value={row.role}
                  onValueChange={(value) => {
                    setManualRowErrors((prev) => {
                      if (!(index in prev)) return prev;
                      const next = { ...prev };
                      delete next[index];
                      return next;
                    });
                    setRows((prev) =>
                      prev.map((item, current) =>
                        current === index ? { ...item, role: value } : item,
                      ),
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeRow(index)}
                  disabled={rows.length === 1}
                >
                  Remove
                </Button>
              </div>
              {manualRowErrors[index] ? (
                <p className="text-sm text-destructive">
                  {manualRowErrors[index]?.join(". ")}
                </p>
              ) : null}
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addRow}>
            Add Row
          </Button>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-3 pt-2">
          <div className="space-y-2">
            <Label htmlFor="csv-upload">Upload CSV</Label>
            <Input
              id="csv-upload"
              type="file"
              accept=".csv"
              onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="text-sm underline text-muted-foreground hover:text-foreground"
              onClick={downloadTemplate}
            >
              Download CSV template
            </button>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBackAction}
          disabled={isSaving}
        >
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={isSaving}
            onClick={async () => {
              setIsSaving(true);
              try {
                await onFinishAction();
              } finally {
                setIsSaving(false);
              }
            }}
          >
            Skip for now
          </Button>
          <Button
            type="button"
            disabled={isSaving}
            onClick={async () => {
              setIsSaving(true);
              try {
                if (csvFile) {
                  await submitCsv();
                } else {
                  await submitManualInvites();
                }
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Failed to send invites",
                );
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving ? "Finishing..." : "Send Invites & Finish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
