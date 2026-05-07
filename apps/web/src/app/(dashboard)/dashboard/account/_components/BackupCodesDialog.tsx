"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BackupCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  codes: string[];
  title: string;
  description: string;
}

/**
 * One-shot display of TOTP backup codes. Clerk only returns these
 * once, so the dialog provides Copy and Download affordances and a
 * blocking "I've saved them" close so the user has to acknowledge.
 */
export function BackupCodesDialog({
  open,
  onOpenChange,
  codes,
  title,
  description,
}: BackupCodesDialogProps) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const joined = codes.join("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joined);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob(
      [`Sous backup codes\n\n${joined}\n\nKeep these somewhere safe.\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sous-backup-codes.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setAcknowledged(true);
  };

  const handleClose = () => {
    setCopied(false);
    setAcknowledged(false);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="rounded border border-amber-700/30 bg-amber-700/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 flex gap-2">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span>These codes won't be shown again. Store them now.</span>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded border border-stone-300 dark:border-white/10 bg-stone-100 dark:bg-stone-900 p-4 font-mono text-sm">
          {codes.map((code) => (
            <div key={code} className="text-stone-900 dark:text-stone-100">
              {code}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
          >
            <Download className="mr-2 h-4 w-4" />
            Download .txt
          </Button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleClose}
            disabled={!acknowledged && !copied}
          >
            I've saved my codes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
