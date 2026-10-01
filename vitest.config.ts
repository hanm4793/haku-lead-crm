import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Worktree copies resolve `@` to root src and break when schemas diverge.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**", "**/.kilo/**"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
