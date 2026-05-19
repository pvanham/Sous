import { useCallback } from "react";
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { OnboardingHeader } from "../components/onboarding-header";
import { ONBOARDING_STEP_COUNT } from "../lib/steps";

/**
 * Step 1 — Welcome. Pure greeting screen, no inputs. We pull the
 * user's first name from Clerk so the headline feels personalised
 * even though we haven't asked them to confirm anything yet.
 */
export function WelcomeScreen() {
  const router = useRouter();
  const { user } = useUser();

  const handleStart = useCallback(() => {
    router.replace("/(onboarding)/profile" as never);
  }, [router]);

  const firstName = user?.firstName?.trim() ?? "";
  const greeting = firstName ? `Welcome, ${firstName}` : "Welcome to Sous";

  return (
    <View className="flex-1 bg-background">
      <OnboardingHeader step={null} totalSteps={ONBOARDING_STEP_COUNT} canGoBack={false} />
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 pb-10">
        <View className="items-center mb-8">
          <View className="w-20 h-20 rounded-3xl bg-primary items-center justify-center mb-6 shadow-sm">
            <MaterialIcons name="restaurant-menu" size={40} color="#fefce8" />
          </View>
          <StyledText variant="title" className="text-3xl text-center">
            {greeting}
          </StyledText>
          <StyledText variant="caption" className="mt-3 text-center text-base">
            Let&apos;s get your account set up so your manager can start
            scheduling you. It only takes a couple of minutes.
          </StyledText>
        </View>

        <View className="bg-card border border-border rounded-2xl px-5 py-4 mb-6">
          <SummaryRow
            icon="badge"
            title="Confirm your profile"
            description="Name, phone, and a photo so your team recognises you."
          />
          <SummaryRow
            icon="restaurant"
            title="Pick your favourite stations"
            description="We'll try to schedule you where you'd rather work."
          />
          <SummaryRow
            icon="schedule"
            title="Set your availability"
            description="When you can work and how many hours you'd like."
          />
          <SummaryRow
            icon="notifications-active"
            title="Turn on notifications"
            description="Schedule changes and shift updates land on your phone."
            isLast
          />
        </View>

        <Button title="Get started" onPress={handleStart} size="lg" />
      </ScrollView>
    </View>
  );
}

interface SummaryRowProps {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  title: string;
  description: string;
  isLast?: boolean;
}

function SummaryRow({ icon, title, description, isLast }: SummaryRowProps) {
  return (
    <View
      className={`flex-row items-start py-3 ${
        isLast ? "" : "border-b border-border"
      }`}
    >
      <View className="w-9 h-9 rounded-full bg-muted items-center justify-center">
        <MaterialIcons name={icon} size={18} color="#78716c" />
      </View>
      <View className="flex-1 pl-3">
        <StyledText variant="body" className="font-semibold">
          {title}
        </StyledText>
        <StyledText variant="caption" className="mt-0.5">
          {description}
        </StyledText>
      </View>
    </View>
  );
}
