/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    agentUpgrade: "security",
  },
};
export default nextConfig;
