import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(process.cwd(), "index.html"),
        voicenotes: resolve(process.cwd(), "voicenotes.html"),
      },
    },
  },
});
