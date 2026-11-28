/** @type {import('next').NextConfig} */
const nextConfig = {
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
