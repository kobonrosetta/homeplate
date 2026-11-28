/** @type {import('next').NextConfig} */
const nextConfig = {
  // Every visitor gets the page title and the share tags (og:title, og:image…)
  // inside <head>, as on Next 14. From Next 15.2 the default is to send them
  // LATER in the page for everything except a built-in list of known preview
  // robots. A kitchen's link is shared in group chats and bios all day, and a
  // preview fetcher that isn't on that list would show a bare link with no
  // name and no photo. Matching every visitor removes the guesswork.
  htmlLimitedBots: /.*/,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb"
    }
  },
  // The built-in image resizer (/_next/image) is switched OFF on purpose and
  // no remote host is allowed. The site shows every photo with a plain <img>
  // tag, and each public photo is already resized once, at upload
  // (lib/image.ts), so nothing here uses the resizer. Until Nov 2026 it was
  // left on with a leftover `*.supabase.co` allowance: anyone could make this
  // server download and decode an image hosted on ANY Supabase project, which
  // is exactly the path of the remote-code holes published against Next's
  // Image Optimization API in Sep and Oct 2026. Do not turn it back on or add
  // remotePatterns without a reason and a review (CLAUDE.md, gotcha #10).
  images: {
    unoptimized: true,
    remotePatterns: []
  }
};

export default nextConfig;
