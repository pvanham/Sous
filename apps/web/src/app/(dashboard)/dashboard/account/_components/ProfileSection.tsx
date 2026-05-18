"use client";

import { ProfileBasicsCard } from "./ProfileBasicsCard";
import { EmailManagementCard } from "./EmailManagementCard";

export function ProfileSection() {
  return (
    <>
      <ProfileBasicsCard />
      <EmailManagementCard />
    </>
  );
}
