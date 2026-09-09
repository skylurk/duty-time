/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep production verification separate from an open development server.
  distDir: process.env.NODE_ENV === 'production' ? '.next-build' : '.next',
};
export default nextConfig;
