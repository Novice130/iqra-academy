import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    // Vendored, minified, and not ours: MediaPipe's WASM glue is copied into
    // public/ at build time by scripts/copy-mediapipe.mjs.
    ignores: [
      "public/**",
      ".next/**",
      ".open-next/**",
      "dist/**",
      "out/**",
      "node_modules/**",
      "scripts/**",
      "*.js",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
];

export default eslintConfig;
