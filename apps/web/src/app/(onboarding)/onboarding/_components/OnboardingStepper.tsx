"use client";

type OnboardingStepperProps = {
  currentStep: number;
  steps: string[];
};

export function OnboardingStepper({ currentStep, steps }: OnboardingStepperProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {steps.map((label, index) => {
          const step = index + 1;
          const isActive = step === currentStep;
          const isComplete = step < currentStep;
          return (
            <div key={label} className="flex-1">
              <div className="flex items-center gap-2">
                <div
                  className={[
                    "h-7 w-7 rounded-full text-xs font-semibold flex items-center justify-center border",
                    isComplete
                      ? "bg-primary text-primary-foreground border-primary"
                      : isActive
                        ? "border-primary text-primary"
                        : "border-muted-foreground/30 text-muted-foreground",
                  ].join(" ")}
                >
                  {step}
                </div>
                <span className={isActive ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="w-full h-1 rounded bg-muted">
        <div
          className="h-1 rounded bg-primary transition-all"
          style={{ width: `${(currentStep / steps.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
