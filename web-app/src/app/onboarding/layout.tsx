"use client";

import { usePathname } from "next/navigation";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFinancialProfile = pathname?.includes("/onboarding/financial-profile");

  if (isFinancialProfile) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-minto-dark flex items-center justify-center px-6">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
