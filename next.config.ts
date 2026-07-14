import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // OAuth discovery for the MCP server must live at the root /.well-known/*
  // path (RFC 9728 / RFC 8414). Serve it from internal API routes via rewrites
  // so we don't depend on Next routing dot-prefixed app directories.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/mcp/well-known/oauth-protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/mcp/well-known/oauth-authorization-server",
      },
      {
        // Vanity guest link. The <slug> is cosmetic (built from the room name)
        // and never parsed — the <token> alone resolves the room. A rewrite
        // (not a redirect) keeps the pretty URL in the address bar while the
        // existing /access/[token] route and its whole subtree serve it
        // unchanged. Old /access/<token> links stay valid forever.
        source: "/room/:slug/:token",
        destination: "/access/:token",
      },
    ];
  },
  // The call-recording module moved under Meetings (every recording is now a
  // meeting). Keep the old /record paths working for bookmarks + the Mac Helper.
  async redirects() {
    return [
      { source: "/record", destination: "/meetings/record", permanent: true },
      {
        source: "/record/:id",
        destination: "/meetings/recordings/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
