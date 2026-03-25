# Framer Motion & Radix Dialog Integration

## The Architecture Anti-Pattern
Integrating Radix UI `Dialog` (or `AlertDialog`) with `framer-motion` is a notorious source of compounding layout and render bugs. 

**DO NOT** do any of the following to animate a Radix Dialog:
1. **DO NOT** wrap `DialogPrimitive.Content` inside a `motion.div` while letting both elements fight over width classes (e.g. `max-w-lg` on the outer stringing `max-w-2xl` on the inner). This causes Close buttons to float off into empty space.
2. **DO NOT** use Radix's `asChild` prop to merge `DialogPrimitive.Content` and `motion.div`. `AnimatePresence`'s internal cloning engine frequently trips Radix's strict `React.Children.only` validation, completely crashing the React render cycle when a dialog closes.
3. **DO NOT** apply `overflow-y-auto` or `max-h` to the outer `motion.div` wrapper. Radix UI forcibly applies `pointer-events: none` to the background to lock page scrolling, meaning your scrollbar will be visible but utterly un-clickable.
4. **DO NOT** use `motion(DialogPrimitive.Content)`. This breaks Radix's internal DOM ref management, causing outside clicks (clicking the overlay to close) or the Escape key to fail silently.

## The Definitive Solution: The Flexbox Wrapper Pattern
To achieve origin-aware, smooth, and bug-free dialog animations, we strictly decouple the Framer animation from the Radix component. 

We wrap the standard Radix element in a **full-screen flex container** that handles the animation, while the Radix element itself handles its own width, scrolling, and pointer events.

### 1. The Transparent Motion Wrapper
The `motion.div` acts ONLY as a vehicle for the animation. It covers the entire screen but is completely invisible and click-through (`pointer-events-none`).
```tsx
<motion.div
  initial="hidden"
  animate="visible"
  exit="hidden"
  variants={{ ... }}
  className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4 sm:p-6"
>
```

### 2. The Interactive Radix Content
The Radix component sits inside the Flexbox wrapper. Because it is natively centered by the flex parent, it doesn't need `-50%` translations. 
It explicitly declares `pointer-events-auto` so it can be interacted with, ignoring the wrapper's lock. It handles its own max-height, scrolling, and consumer-provided classNames.
```tsx
  <DialogPrimitive.Content
    forceMount
    ref={ref}
    className={cn(
      "grid gap-4 w-full max-w-lg outline-none pointer-events-auto",
      "p-6 max-h-[90vh] overflow-y-auto relative",
      "bg-card border shadow-xl rounded",
      className // Overrides applied here gracefully update the child box
    )}
    {...props}
  >
    {children}
  </DialogPrimitive.Content>
</motion.div>
```

### 3. Origin-Aware Animations
Because the dialog is flex-centered natively, its default resting position is `x: 0, y: 0`. 
To animate the dialog expanding from the user's cursor click, we track the global `mousedown` event and animate from the click distance to `0`.
```tsx
let lastClickPosition: { x: number; y: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("mousedown", (e) => {
    lastClickPosition = { x: e.clientX, y: e.clientY };
  }, true);
} // ... later ...
hidden: {
  opacity: 0,
  scale: 0.8,
  x: lastClickPosition ? lastClickPosition.x - (window.innerWidth / 2) : 0,
  y: lastClickPosition ? lastClickPosition.y - (window.innerHeight / 2) : 10,
}
```

By following this pattern, we ensure:
- Native Radix accessibility and focus-trapping works flawlessly.
- Background scrolling is locked correctly.
- Dialog scrolling works smoothly without pointer-event drops.
- React does not crash when unmounting the dialog.
- Consumer `className` overrides (like dynamic sizing) work without constraint conflicts.
