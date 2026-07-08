import { vercelPreset } from "@vercel/react-router/vite";

/** @type {import('@react-router/dev/config').Config} */
export default {
  // Server-side rendering (the Shopify embedded app is SSR).
  ssr: true,
  // Emits Vercel-compatible serverless output on `react-router build`.
  presets: [vercelPreset()],
};
