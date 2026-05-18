"use client";

import { ChangePasswordCard } from "./ChangePasswordCard";
import { MFACard } from "./MFACard";
import { ActiveSessionsCard } from "./ActiveSessionsCard";

export function SecuritySection() {
  return (
    <>
      <ChangePasswordCard />
      <MFACard />
      <ActiveSessionsCard />
    </>
  );
}
