"use client";

import { useMemo, useState, type KeyboardEventHandler } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { normalizeTag } from "@/lib/announcement/composer-defaults";

type TagInputProps = {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

const SUGGESTED_TAGS = [
  "menu update",
  "hr",
  "safety",
  "schedule",
  "training",
  "operations",
  "inventory",
];

export function TagInput({ value, onChange, disabled = false }: TagInputProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  const normalizedSet = useMemo(() => new Set(value), [value]);
  const suggestions = useMemo(
    () => SUGGESTED_TAGS.filter((tag) => !normalizedSet.has(tag)),
    [normalizedSet]
  );

  const addTag = (raw: string) => {
    const normalized = normalizeTag(raw);
    if (!normalized) return;
    if (normalizedSet.has(normalized)) return;
    if (value.length >= 20) return;
    onChange([...value, normalized]);
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((entry) => entry !== tag));
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag(input);
      return;
    }

    if (event.key === "Backspace" && input.length === 0 && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            <span>{tag}</span>
            <button
              type="button"
              disabled={disabled}
              className="rounded-sm p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between"
          >
            <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
              {value.length === 0 ? "Add tags" : `${value.length} tag(s) selected`}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Type a tag and press Enter..."
              value={input}
              onValueChange={setInput}
              onKeyDown={handleKeyDown}
            />
            <CommandList>
              <CommandEmpty>No matching tags.</CommandEmpty>
              <CommandGroup heading="Suggestions">
                {suggestions.map((tag) => {
                  const selected = normalizedSet.has(tag);
                  return (
                    <CommandItem
                      key={tag}
                      value={tag}
                      onSelect={() => {
                        addTag(tag);
                      }}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          selected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span>{tag}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <p className="text-xs text-muted-foreground">
        Up to 20 tags. Each tag is normalized to lowercase and capped at 32 characters.
      </p>
    </div>
  );
}
