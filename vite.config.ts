import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  base: "/florida-politics/",
  publicDir: "../public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
