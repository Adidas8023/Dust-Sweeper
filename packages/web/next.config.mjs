/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@dust-sweeper/core"],
  experimental: {
    serverComponentsExternalPackages: ["@solana/web3.js", "bs58"],
  },
};
export default nextConfig;
