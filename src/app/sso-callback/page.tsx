import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export default function SSOCallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-foreground" />
        <p className="text-muted-foreground font-medium">Completing your login...</p>
      </div>
      <AuthenticateWithRedirectCallback />
    </div>
  );
}
