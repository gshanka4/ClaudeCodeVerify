import { cpSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const srcDir = join(rootDir, "src");

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
  // Bundled entry resolves migrations next to dist/index.js (dist/migrations).
  async onSuccess() {
    cpSync(join(rootDir, "src/db/migrations"), join(rootDir, "dist/migrations"), {
      recursive: true,
    });
  },
});
