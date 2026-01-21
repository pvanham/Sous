"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { toast } from "sonner";
import { Upload, FileText, AlertCircle, Check } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import {
  csvRowSchema,
  parseCsvRowToStaff,
  type CsvRowInput,
} from "@/lib/validations/staff.schema";
import { importStaffFromCSV } from "@/server/actions/staff.actions";
import type { ImportResult } from "@/types/staff";

interface StaffCsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  data: ReturnType<typeof parseCsvRowToStaff>;
  valid: boolean;
  error?: string;
}

export function StaffCsvImportDialog({
  open,
  onOpenChange,
}: StaffCsvImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setFile(null);
      setParsedRows([]);
      setParseError(null);
      setImportResult(null);
    }
    onOpenChange(isOpen);
  };

  // Parse CSV file
  const parseFile = useCallback((csvFile: File) => {
    setParseError(null);
    setParsedRows([]);

    Papa.parse<Record<string, string>>(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setParseError(
            `CSV parsing errors: ${results.errors.map((e) => e.message).join(", ")}`
          );
          return;
        }

        if (results.data.length === 0) {
          setParseError("CSV file is empty or has no valid rows");
          return;
        }

        // Validate and transform each row
        const rows: ParsedRow[] = results.data.map((row, index) => {
          try {
            // Map CSV columns to expected format
            const csvRow: CsvRowInput = {
              name: row.name?.trim() || "",
              email: row.email?.trim() || "",
              phone: row.phone?.trim() || "",
              roles: row.roles?.trim() || "",
              skills: row.skills?.trim() || "",
            };

            // Validate with Zod
            const parseResult = csvRowSchema.safeParse(csvRow);
            if (!parseResult.success) {
              const errorMsg = parseResult.error.issues
                .map((e) => e.message)
                .join(", ");
              return {
                data: parseCsvRowToStaff({
                  name: csvRow.name || "Invalid",
                  email: csvRow.email || "invalid@example.com",
                  phone: csvRow.phone || "0000000000",
                  roles: csvRow.roles || "Unknown",
                  skills: "",
                }),
                valid: false,
                error: `Row ${index + 1}: ${errorMsg}`,
              };
            }

            return {
              data: parseCsvRowToStaff(parseResult.data),
              valid: true,
            };
          } catch (err) {
            return {
              data: parseCsvRowToStaff({
                name: row.name || "Invalid",
                email: row.email || "invalid@example.com",
                phone: row.phone || "0000000000",
                roles: row.roles || "Unknown",
                skills: "",
              }),
              valid: false,
              error: `Row ${index + 1}: ${err instanceof Error ? err.message : "Parse error"}`,
            };
          }
        });

        setParsedRows(rows);
      },
      error: (error) => {
        setParseError(`Failed to parse CSV: ${error.message}`);
      },
    });
  }, []);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith(".csv")) {
        setParseError("Please select a CSV file");
        return;
      }
      setFile(selectedFile);
      parseFile(selectedFile);
    }
  };

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        if (!droppedFile.name.endsWith(".csv")) {
          setParseError("Please select a CSV file");
          return;
        }
        setFile(droppedFile);
        parseFile(droppedFile);
      }
    },
    [parseFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      const validStaff = parsedRows
        .filter((row) => row.valid)
        .map((row) => row.data);

      const result = await importStaffFromCSV(validStaff);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      
      // Show toast with summary
      if (data.skipped > 0) {
        toast.warning(
          `Imported ${data.inserted} new, updated ${data.updated}. ${data.skipped} row(s) skipped due to validation errors.`
        );
      } else {
        toast.success(`Successfully imported ${data.inserted} new staff, updated ${data.updated} existing.`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const validRowCount = parsedRows.filter((r) => r.valid).length;
  const invalidRowCount = parsedRows.filter((r) => !r.valid).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Staff from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with staff data. Required columns: name, email,
            phone, roles. Optional: skills (format: Station:Proficiency,Station:Proficiency)
          </DialogDescription>
        </DialogHeader>

        {/* File Upload Area */}
        {!file && (
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 transition-colors hover:border-muted-foreground/50"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="mb-2 text-sm font-medium">
              Drag and drop your CSV file here
            </p>
            <p className="mb-4 text-xs text-muted-foreground">or</p>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* Parse Error */}
        {parseError && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm">{parseError}</p>
          </div>
        )}

        {/* File Selected */}
        {file && !parseError && (
          <>
            <div className="flex items-center gap-2 rounded-md bg-muted p-3">
              <FileText className="h-4 w-4" />
              <span className="text-sm font-medium">{file.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setFile(null);
                  setParsedRows([]);
                }}
              >
                Remove
              </Button>
            </div>

            {/* Stats */}
            <div className="flex gap-4">
              <Badge variant="default" className="flex items-center gap-1">
                <Check className="h-3 w-3" />
                {validRowCount} valid rows
              </Badge>
              {invalidRowCount > 0 && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {invalidRowCount} invalid rows
                </Badge>
              )}
            </div>

            {/* Preview Table */}
            {parsedRows.length > 0 && (
              <div className="max-h-80 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Status</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Skills</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 10).map((row, index) => (
                      <TableRow
                        key={index}
                        className={!row.valid ? "bg-destructive/5" : undefined}
                      >
                        <TableCell>
                          {row.valid ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.data.name}
                        </TableCell>
                        <TableCell>{row.data.email}</TableCell>
                        <TableCell>{row.data.phone}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.data.roles.map((role) => (
                              <Badge key={role} variant="secondary" className="text-xs">
                                {role}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.data.skills.map((skill) => (
                              <Badge
                                key={skill.station}
                                variant="outline"
                                className="text-xs"
                              >
                                {skill.station}: {skill.proficiency}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedRows.length > 10 && (
                  <p className="p-2 text-center text-xs text-muted-foreground">
                    Showing first 10 of {parsedRows.length} rows
                  </p>
                )}
              </div>
            )}

            {/* CSV Parse Validation Errors (format errors) */}
            {invalidRowCount > 0 && !importResult && (
              <div className="rounded-md bg-destructive/10 p-3">
                <p className="mb-2 text-sm font-medium text-destructive">
                  Format Validation Errors:
                </p>
                <ul className="list-inside list-disc text-xs text-destructive">
                  {parsedRows
                    .filter((r) => !r.valid)
                    .slice(0, 5)
                    .map((row, index) => (
                      <li key={index}>{row.error}</li>
                    ))}
                  {invalidRowCount > 5 && (
                    <li>...and {invalidRowCount - 5} more errors</li>
                  )}
                </ul>
              </div>
            )}
          </>
        )}

        {/* Import Result Summary */}
        {importResult && (
          <div className="space-y-4">
            {/* Success Summary */}
            <div className="rounded-md bg-green-500/10 p-4">
              <h4 className="mb-2 flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
                <Check className="h-4 w-4" />
                Import Complete
              </h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">New Staff</p>
                  <p className="text-lg font-semibold">{importResult.inserted}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Updated</p>
                  <p className="text-lg font-semibold">{importResult.updated}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Skipped</p>
                  <p className={`text-lg font-semibold ${importResult.skipped > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                    {importResult.skipped}
                  </p>
                </div>
              </div>
            </div>

            {/* Skipped Rows Detail */}
            {importResult.errors.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
                <h4 className="mb-3 flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4" />
                  {importResult.errors.length} Row(s) Skipped Due to Configuration Mismatch
                </h4>
                <p className="mb-3 text-xs text-muted-foreground">
                  The following rows were not imported because their roles or stations don&apos;t match your kitchen configuration.
                  Update your kitchen settings to include these roles/stations, then re-import.
                </p>
                <div className="max-h-48 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead className="w-48">Email</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult.errors.map((error, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-xs">{error.row}</TableCell>
                          <TableCell className="text-xs">{error.email}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{error.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {importResult ? (
            <Button onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={validRowCount === 0 || importMutation.isPending}
              >
                {importMutation.isPending
                  ? "Importing..."
                  : `Import ${validRowCount} Staff`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
