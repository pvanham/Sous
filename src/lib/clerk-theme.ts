import { dark } from "@clerk/themes";
import type { Theme } from "@clerk/types";

export const appClerkAppearance: Theme = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#1c1917", // stone-900 (light mode) / white (dark mode) - We'll use CSS vars for dynamic if needed, but for now we'll stick to a dark default for auth to match the sleek SaaS vibe
    colorBackground: "#0c0a09", // stone-950
    colorInputBackground: "#1c1917", // stone-900
    colorInputText: "#f5f5f4", // stone-50
    colorText: "#f5f5f4",
    colorTextSecondary: "#a8a29e", // stone-400
    colorDanger: "#ef4444",
    colorSuccess: "#22c55e",
    colorWarning: "#f59e0b",
    borderRadius: "0.5rem", // rounded-lg
    fontFamily: "var(--font-geist-sans)",
  },
  elements: {
    card: "bg-stone-950 border border-white/10 shadow-2xl backdrop-blur-xl",
    headerTitle: "text-stone-50 font-bold tracking-tight",
    headerSubtitle: "text-stone-400",
    dividerLine: "bg-white/10",
    dividerText: "text-stone-500",
    formFieldLabel: "text-stone-300 font-medium",
    formFieldInput: "bg-stone-900 border-white/10 text-stone-50 focus:ring-2 focus:ring-stone-500 focus:border-transparent transition-all",
    formButtonPrimary: "bg-white text-stone-950 hover:bg-stone-200 transition-colors font-semibold shadow-md active:scale-[0.98]",
    formButtonReset: "text-stone-400 hover:text-stone-100 transition-colors",
    socialButtonsBlockButton: "bg-stone-900 border border-white/10 hover:bg-stone-800 text-stone-300 hover:text-stone-50 transition-colors",
    socialButtonsBlockButtonText: "font-medium",
    footerActionText: "text-stone-400",
    footerActionLink: "text-stone-300 hover:text-white transition-colors underline-offset-4 hover:underline",
    identityPreviewText: "text-stone-300",
    identityPreviewEditButton: "text-stone-400 hover:text-stone-100",
  },
};
