/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel expects production output in .next; isolate local development output.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  // Bundle the Admin SDK's CommonJS/ESM boundary for Vercel's module loader.
  // jwks-rsa 4 requires ESM-only jose 6; externalizing this chain crashes at startup.
  transpilePackages: ['firebase-admin', 'jwks-rsa', 'jose'],
};
export default nextConfig;
