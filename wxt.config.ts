import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Trailogue",
    description: "答えではなく、たどり着き方を残す。",
    action: {},
    permissions: ["tabs"],
    host_permissions: [
      "https://copilot.cloud.microsoft/*",
      "https://chatgpt.com/*",
    ],
  },
});
