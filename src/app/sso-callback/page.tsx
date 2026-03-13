import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export default function SSOCallback() {
  // Handle the redirect flow for OAuth providers like Google
  return (
    <div className="flex h-screen w-full items-center justify-center bg-stone-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-800 border-t-white" />
        <p className="text-stone-400 font-medium">Completing your login...</p>
      </div>
      <AuthenticateWithRedirectCallback />
    </div>
  );
}
