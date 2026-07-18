export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="h-9 w-64 animate-pulse rounded bg-line" />
      <div className="mt-3 h-4 w-40 animate-pulse rounded bg-line" />
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-line" />
        ))}
      </div>
    </main>
  );
}
