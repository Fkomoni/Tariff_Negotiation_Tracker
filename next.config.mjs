/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        // Applies to every response, including static assets — harmless
        // there since these headers only constrain how a *page* can be
        // framed/rendered, not how a script/image tag can load it.
        source: "/:path*",
        headers: [
          // Clickjacking protection for an authenticated staff portal — no
          // legitimate case for this app being embedded in another site's
          // iframe. CSP frame-ancestors is the modern mechanism; X-Frame-
          // Options covers older browsers that don't honor it.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
