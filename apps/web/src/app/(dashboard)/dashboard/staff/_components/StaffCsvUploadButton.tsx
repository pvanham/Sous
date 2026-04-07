"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StaffCsvImportDialog } from "./StaffCsvImportDialog";

export function StaffCsvUploadButton() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsDialogOpen(true)}>
        <Upload className="mr-2 h-4 w-4" />
        Import CSV
      </Button>

      <StaffCsvImportDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
}
