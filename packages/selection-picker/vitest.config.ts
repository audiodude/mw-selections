import { defineConfig } from "vitest/config";

export default defineConfig({
  // Private #methods and static class fields must survive transformation.
  esbuild: { target: "es2022" },
  test: { environment: "happy-dom" },
});
