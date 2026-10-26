import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const deskRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: deskRoot,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    fs: { allow: [repoRoot] },
  },
});
