/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel expects production output in .next; isolate local development output.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
};
export default nextConfig;
