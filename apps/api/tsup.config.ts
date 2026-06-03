import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  dts: false,
  // Resolve the `@/*` path alias at bundle time (mirrors tsconfig paths).
  esbuildOptions(options) {
    options.alias = { "@": srcDir };
  },
});
