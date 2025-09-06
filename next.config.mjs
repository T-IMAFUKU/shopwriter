/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ⚠ 重要: API Routes を使うため static export は使わない
  // output: 'export' は絶対に書かない
};

export default nextConfig;
