const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true, // permite importar ../services/*
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias["@"] = path.resolve(__dirname, "src");
    return config;
  },
};

module.exports = nextConfig;
