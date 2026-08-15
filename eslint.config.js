import next from "eslint-config-next/core-web-vitals";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";

// eslint-config-next already bundles typescript-eslint, react, react-hooks,
// import and jsx-a11y — do not register those plugins again here or ESLint
// throws on the duplicate definitions.
/** @type {import("eslint").Linter.Config[]} */
const config = [
  { ignores: [".next/**", "out/**", "next-env.d.ts"] },
  ...next,
  eslintPluginPrettier,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Vendored shadcn/ui output — kept byte-compatible with the generator so it
    // can be re-added or updated with the CLI. It predates the React Compiler
    // lint rules and is not ours to rewrite.
    files: ["src/components/ui/**", "src/hooks/**"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default config;
