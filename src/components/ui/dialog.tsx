"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils";

let lastClickPosition: { x: number; y: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "mousedown",
    (e) => {
      lastClickPosition = { x: e.clientX, y: e.clientY };
    },
    true
  );
}

const DialogContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => {} });

const Dialog = ({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) => {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen || false);
  const isControlled = open !== undefined;
  const currentOpen = isControlled ? open : internalOpen;

  const handleOpenChange = React.useCallback(
    (value: boolean) => {
      if (!isControlled) {
        setInternalOpen(value);
      }
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange]
  );

  return (
    <DialogContext.Provider
      value={{ open: currentOpen, setOpen: handleOpenChange }}
    >
      <DialogPrimitive.Root
        open={currentOpen}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </DialogContext.Provider>
  );
};

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <motion.div
    key="overlay"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2 }}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
      className
    )}
  >
    <DialogPrimitive.Overlay forceMount ref={ref} {...props} className="w-full h-full" />
  </motion.div>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const { open } = React.useContext(DialogContext);

  return (
    <DialogPortal forceMount>
      <AnimatePresence>
        {open && <DialogOverlay key="overlay" />}
        {open && (
            <motion.div
              key="content"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={{
                hidden: {
                  opacity: 0,
                  scale: 0.8,
                  x: lastClickPosition
                    ? `calc(-50% + ${
                        lastClickPosition.x -
                        (typeof window !== "undefined"
                          ? window.innerWidth / 2
                          : 0)
                      }px)`
                    : "-50%",
                  y: lastClickPosition
                    ? `calc(-50% + ${
                        lastClickPosition.y -
                        (typeof window !== "undefined"
                          ? window.innerHeight / 2
                          : 0)
                      }px)`
                    : "-48%",
                },
                visible: {
                  opacity: 1,
                  scale: 1,
                  x: "-50%",
                  y: "-50%",
                },
              }}
              transition={{
                type: "spring",
                damping: 25,
                stiffness: 300,
                opacity: { duration: 0.2 },
              }}
              className={cn(
                // Position & Layout
                "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg gap-4 p-6",
                // Light mode - Unbleached paper with stone border (no shadow)
                "bg-card border border-stone-300",
                // Dark mode - stone-800 with white/10 border (no shadow)
                "dark:bg-card dark:border-white/10",
                // Sharp corners (Industrial)
                "rounded",
                className
              )}
            >
              <DialogPrimitive.Content 
                forceMount 
                ref={ref} 
                className="w-full h-full flex flex-col gap-4 outline-none" 
                {...props}
              >
                {children}
                <DialogPrimitive.Close className="absolute right-4 top-4 rounded opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              </DialogPrimitive.Content>
            </motion.div>
        )}
      </AnimatePresence>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-stone-900 dark:text-stone-100",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
