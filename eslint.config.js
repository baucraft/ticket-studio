import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier/flat"
import { defineConfig, globalIgnores } from "eslint/config"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"
import tseslint from "typescript-eslint"

export default defineConfig([
  globalIgnores(["dist", "node_modules", "public/vendor/**"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.browser,
    },
    rules: {
      // This is handled by TypeScript.
      "no-undef": "off",

      // Keep imports clean.
      "react-refresh/only-export-components": "off",

      // TanStack Virtual is safe here; this rule is React Compiler-focused.
      "react-hooks/incompatible-library": "off",
    },
  },
  eslintConfigPrettier,
])
