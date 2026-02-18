const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true, // permite importar ../services/*
  },
  outputFileTracingIncludes: {
    // Jobs ejecutados por /api/run (spawn de scripts fuera de control-tower)
    "/api/run": [
      "../scripts/**/*",
      "../resources/**/*",
      "../services/**/*",
    ],
  },
  turbopack: {
    resolveAlias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias["@"] = path.resolve(__dirname, "src");
    return config;
  },
};

module.exports = nextConfig;
