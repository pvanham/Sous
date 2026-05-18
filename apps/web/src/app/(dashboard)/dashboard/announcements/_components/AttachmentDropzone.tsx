"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ALLOWED_ATTACHMENT_MIME_TYPES } from "@/lib/storage/keys";

type AttachmentDropzoneProps = {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

type PendingUpload = {
  id: string;
  name: string;
};

type UploadUrlResponse = {
  uploadUrl: string;
  publicUrl: string;
};

const MAX_ATTACHMENTS = 10;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function AttachmentDropzone({
  value,
  onChange,
  disabled = false,
}: AttachmentDropzoneProps) {
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUploadMore = value.length + pendingUploads.length < MAX_ATTACHMENTS;

  const removeAttachment = (url: string) => {
    onChange(value.filter((existing) => existing !== url));
  };

  const uploadAttachment = async (file: File): Promise<UploadUrlResponse> => {
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number])) {
      throw new Error("Unsupported file type. Upload an image or PDF.");
    }

    const uploadUrlResponse = await fetch("/api/attachments/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }),
    });

    if (!uploadUrlResponse.ok) {
      const errorPayload = (await uploadUrlResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(errorPayload?.error ?? "Failed to prepare upload.");
    }

    const payload = (await uploadUrlResponse.json()) as UploadUrlResponse;

    const putResponse = await fetch(payload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });

    if (!putResponse.ok) {
      throw new Error("Upload failed. Please try again.");
    }

    return payload;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return;

    for (const file of Array.from(files)) {
      if (value.length + pendingUploads.length >= MAX_ATTACHMENTS) break;
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`${file.name} exceeds 10MB and was skipped.`);
        continue;
      }

      const uploadId = `${file.name}-${file.lastModified}-${Math.random()}`;
      setPendingUploads((prev) => [...prev, { id: uploadId, name: file.name }]);

      try {
        const uploaded = await uploadAttachment(file);
        onChange([...value, uploaded.publicUrl]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to upload attachment.";
        toast.error(message);
      } finally {
        setPendingUploads((prev) => prev.filter((entry) => entry.id !== uploadId));
      }
    }
  };

  return (
    <div className="space-y-3">
      <div
        className="flex min-h-[120px] flex-col items-center justify-center rounded border-2 border-dashed border-muted-foreground/30 p-6 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium">Drag files here or browse</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Up to 10 files, 10MB max each (images and PDFs)
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={disabled || !canUploadMore}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip />
          Browse files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {(value.length > 0 || pendingUploads.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {value.map((url) => (
            <Badge key={url} variant="outline" className="max-w-full gap-2 pr-1">
              <span className="truncate">{decodeURIComponent(url.split("/").at(-1) ?? "file")}</span>
              <button
                type="button"
                aria-label="Remove attachment"
                disabled={disabled}
                className="rounded-sm p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                onClick={() => removeAttachment(url)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {pendingUploads.map((upload) => (
            <Badge key={upload.id} variant="secondary" className="gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{upload.name}</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
