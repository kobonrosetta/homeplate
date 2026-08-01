// Renders one or more schema.org objects as a JSON-LD <script>. Server-rendered
// so crawlers and AI answer engines see the structured data in the initial HTML.
// The `<` escape guards against a "</script>" breakout from any user-supplied
// field baked into the schema (kitchen names, bios, dish titles).
export default function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
