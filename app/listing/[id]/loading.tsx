export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="aspect-square animate-pulse rounded-2xl bg-line" />
        <div className="space-y-3">
          <div className="h-7 w-2/3 animate-pulse rounded bg-line" />
          <div className="h-6 w-24 animate-pulse rounded bg-line" />
          <div className="h-4 w-full animate-pulse rounded bg-line" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-line" />
          <div className="h-10 w-32 animate-pulse rounded-full bg-line" />
        </div>
      </div>
    </main>
  );
}
