import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { OnboardingWizard } from "./_components/OnboardingWizard";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return <OnboardingWizard />;
}
