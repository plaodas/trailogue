import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".wxt/**", ".output/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "react-dom", "dexie", "wxt"],
          patterns: ["react/*", "react-dom/*", "dexie/*", "wxt/*"],
        },
      ],
    },
  },
  {
    files: ["src/providers/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "react-dom", "dexie"],
          patterns: ["react/*", "react-dom/*", "dexie/*"],
        },
      ],
    },
  },
);
