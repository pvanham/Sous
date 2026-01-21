import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Sous</h1>
      <p className="text-muted-foreground">
        AI-assisted scheduling for high-volume kitchens.
      </p>
      <Link
        href="/dashboard"
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        Go to Dashboard
      </Link>
    </main>
  );
}
