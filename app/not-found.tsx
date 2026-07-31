import Link from "next/link";
import ForkMark from "@/components/fork-mark";

export const metadata = {
  title: "Page not found — ForkFork",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <div className="text-faint">
        <ForkMark size={44} />
      </div>
      <h1 className="mt-6 text-2xl font-semibold text-ink">
        This one&rsquo;s not on the menu
      </h1>
      <p className="mt-2 text-muted">
        The page you&rsquo;re after doesn&rsquo;t exist, or the kitchen has
        closed up. Let&rsquo;s find you something good to eat instead.
      </p>
      <Link
        href="/browse"
        className="mt-8 inline-block rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
      >
        Browse kitchens
      </Link>
    </main>
  );
}
