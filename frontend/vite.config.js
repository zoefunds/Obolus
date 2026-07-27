import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_URL || "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    // genlayer-js + viem alone exceed the default 500kB warning threshold —
    // expected and fine (see the manualChunks comment below), not something
    // further splitting would meaningfully improve.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // genlayer-js + viem (its signing/RPC backbone) account for most of
        // the bundle weight and change far less often than app code — split
        // them into their own chunk so a normal app-code deploy doesn't
        // invalidate the browser cache for this vendor chunk, and so the
        // single-chunk 500kB warning reflects real app-code growth instead
        // of just restating "genlayer-js is not small."
        manualChunks: {
          genlayer: ["genlayer-js", "viem"],
        },
      },
    },
  },
});
