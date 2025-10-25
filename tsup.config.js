import { defineConfig } from "tsup";

export default defineConfig({
  bundle: true,
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  splitting: false,
});
