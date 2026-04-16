"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StaffFormDialog } from "./StaffFormDialog";

export function AddStaffButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Add Staff
      </Button>
      <StaffFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
