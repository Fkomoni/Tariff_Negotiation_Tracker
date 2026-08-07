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
        // Applies to every response, including static assets - harmless
        // there since these headers only constrain how a *page* can be
        // framed/rendered, not how a script/image tag can load it.
        source: "/:path*",
        headers: [
          // Clickjacking protection for an authenticated staff portal - no
          // legitimate case for this app being embedded in another site's
          // iframe. CSP frame-ancestors is the modern mechanism; X-Frame-
          // Options covers older browsers that don't honor it.
          { key: "X-Frame-Options", value: "DENY" },
          // A real policy, not just frame-ancestors. 'unsafe-inline' is kept for
          // script/style because Next's App Router injects inline hydration
          // bootstrap scripts and inline styles and this app doesn't use a
          // per-request nonce; 'self' still blocks loading any EXTERNAL script,
          // and the app has no HTML-injection sink (no dangerouslySetInnerHTML),
          // so the residual inline-script risk is low. object/base/form/frame
          // are locked down, and connect-src 'self' keeps client fetches on
          // this origin (all data calls are same-origin /api routes).
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "object-src 'none'",
              "base-uri 'none'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
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
