export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-minto-dark flex items-center justify-center px-6">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
