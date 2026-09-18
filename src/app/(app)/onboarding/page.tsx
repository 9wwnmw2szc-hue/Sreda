import type { Metadata } from "next";
import { OnboardingView } from "@/components/onboarding/OnboardingView";

export const metadata: Metadata = { title: "Онбординг" };

export default function OnboardingPage() {
  return <OnboardingView />;
}
