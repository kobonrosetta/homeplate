export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="h-7 w-48 animate-pulse rounded bg-line" />
      <div className="mt-3 h-4 w-32 animate-pulse rounded bg-line" />
      <div className="mt-10 h-5 w-24 animate-pulse rounded bg-line" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-line" />
        ))}
      </div>
    </main>
  );
}
