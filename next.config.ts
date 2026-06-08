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
    ];
  },
};

export default nextConfig;
