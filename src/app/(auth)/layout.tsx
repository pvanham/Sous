export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-50 flex flex-col font-sans selection:bg-white/20 relative overflow-hidden">
      
      {/* Abstract Background Elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_50%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-stone-950 to-transparent pointer-events-none" />

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>

    </div>
  );
}
