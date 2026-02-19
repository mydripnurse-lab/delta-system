const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true, // permite importar ../services/*
  },
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  outputFileTracingIncludes: {
    // Jobs ejecutados por /api/run (spawn de scripts fuera de control-tower)
    "/api/run": [
      "../scripts/**/*",
      "../resources/**/*",
      "../services/**/*",
      // only runtime deps required by external scripts
      "./node_modules/googleapis/**/*",
      "./node_modules/googleapis-common/**/*",
      "./node_modules/google-auth-library/**/*",
      "./node_modules/gaxios/**/*",
      "./node_modules/gtoken/**/*",
      "./node_modules/twilio/**/*",
      "./node_modules/axios/**/*",
      "./node_modules/form-data/**/*",
      "./node_modules/qs/**/*",
      "./node_modules/scmp/**/*",
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
