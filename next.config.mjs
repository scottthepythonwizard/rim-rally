/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    agentUpgrade: "security",
    serverActions: { bodySizeLimit: "6mb" },
  },
};
export default nextConfig;
