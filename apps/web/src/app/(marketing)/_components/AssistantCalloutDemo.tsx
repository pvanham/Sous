"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, GitPullRequestArrow, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Scripted call-out in the marketing assistant. Names match the example
 * week on the hero board. The loop is decorative; the paragraph beside
 * it is the accessible description.
 */

const PHASE_MS = [500, 1100, 900, 2400, 1400, 800, 4800] as const;

const SUGGESTIONS = [
  {
    name: "Jordan Okonkwo",
    detail: "Trained on sauté · 30h this week",
  },
  {
    name: "Sam Patel",
    detail: "Trained on sauté · under the weekly minimum",
  },
] as const;

export function AssistantCalloutDemo() {
  const [phase, setPhase] = useState(0);
  const [reduced, setReduced] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => {
      setPhase((current) => (current + 1) % PHASE_MS.length);
    }, PHASE_MS[phase]);
    return () => window.clearTimeout(timer);
  }, [phase, reduced]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [phase, reduced]);

  const step = reduced ? PHASE_MS.length - 1 : phase;
  const showCallout = step >= 1;
  const showThinking = step === 2 || step === 5;
  const showOptions = step >= 3;
  const picked = step >= 4;
  const showChoice = step >= 4;
  const showCard = step >= 6;

  return (
    <div className="mt-6 flex h-[28rem] flex-col overflow-hidden border border-white/10 bg-[#292524]">
      <div
        className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3"
        style={{
          background:
            "linear-gradient(135deg, rgba(245,158,11,0.16) 0%, rgba(225,29,72,0.08) 60%, transparent 100%)",
        }}
      >
        <div className="ai-gradient flex h-9 w-9 items-center justify-center rounded-xl">
          <Bot className="h-[18px] w-[18px] text-white" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">Sous</p>
          <p className="mt-1 text-[11px] font-medium text-emerald-400">
            Online · Scheduling assistant
          </p>
        </div>
      </div>

      <div
        ref={scrollerRef}
        data-callout-log
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
        aria-hidden
      >
        {showCallout ? (
          <UserLine>Maya just called out. She&apos;s on sauté tonight, 4 to 10.</UserLine>
        ) : (
          <p className="m-auto max-w-[16rem] text-center text-xs leading-5 text-[#a8a29e]">
            A call-out lands in the chat. The assistant looks for a cover.
          </p>
        )}

        {showThinking && step === 2 ? <Thinking /> : null}

        {showOptions ? (
          <div className="mr-6 space-y-3">
            <AssistantLine>
              Maya is the only sauté on that shift. Two people can cover it
              without breaking a station skill or an hour cap.
            </AssistantLine>
            <div className="grid gap-2">
              {SUGGESTIONS.map((option, index) => {
                const selected = picked && index === 0;
                const faded = picked && index !== 0;
                return (
                  <div
                    key={option.name}
                    className={cn(
                      "rounded border px-3 py-2 transition-colors duration-300",
                      selected
                        ? "border-amber-500 bg-amber-500/15"
                        : "border-white/10 bg-[#1c1917]",
                      faded && "opacity-40",
                    )}
                  >
                    <p className="text-sm font-medium text-[#f5f5f4]">{option.name}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#a8a29e]">
                      {option.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {showChoice ? <UserLine>Put Jordan on it.</UserLine> : null}

        {showThinking && step === 5 ? <Thinking /> : null}

        {showCard ? (
          <div className="mr-4 space-y-3">
            <AssistantLine>
              Here&apos;s the change. Nothing moves until you approve it.
            </AssistantLine>
            <div className="border border-white/10 border-l-4 border-l-amber-500 bg-[#1c1917] p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GitPullRequestArrow
                  className="h-4 w-4 text-amber-500"
                  aria-hidden
                />
                Reassign shift
              </div>
              <ul className="mt-2 space-y-1 text-sm text-[#a8a29e]">
                <li>Tonight, 4:00pm–10:00pm · Sauté</li>
                <li>Maya Chen → Jordan Okonkwo</li>
              </ul>
              <div className="mt-3 flex gap-2">
                <span className="ai-gradient inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Approve
                </span>
                <span className="inline-flex h-8 items-center gap-1.5 rounded border border-white/10 px-3 text-xs font-medium text-[#d6d3d1]">
                  <XCircle className="h-3.5 w-3.5" aria-hidden />
                  Deny
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UserLine({ children }: { children: string }) {
  return (
    <p className="ml-10 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm leading-6 text-[#e7e5e4]">
      {children}
    </p>
  );
}

function AssistantLine({ children }: { children: string }) {
  return <p className="text-sm leading-6 text-[#d6d3d1]">{children}</p>;
}

function Thinking() {
  return (
    <div className="flex items-center gap-1 py-1" aria-hidden>
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500"
          style={{ animationDelay: `${dot * 0.15}s` }}
        />
      ))}
    </div>
  );
}
