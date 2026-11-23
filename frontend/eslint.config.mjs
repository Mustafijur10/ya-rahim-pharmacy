import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Project rule: all CSS lives in styles/app.css. No styles inside components.
    rules: {
      "react/forbid-dom-props": ["error", { forbid: [{ propName: "style", message: "Inline styles are not allowed. Add a class to styles/app.css." }] }],
      "react/forbid-component-props": ["error", { forbid: [{ propName: "style", message: "Inline styles are not allowed. Add a class to styles/app.css." }] }],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["*.css", "!@/styles/app.css"], message: "Only @/styles/app.css may be imported (in app/layout.tsx)." },
            { group: ["*.module.css", "*.scss", "*.sass", "*.less"], message: "CSS modules / preprocessors are not allowed. Use styles/app.css." },
          ],
          paths: [
            { name: "styled-components", message: "CSS-in-JS is not allowed. Use styles/app.css." },
            { name: "@emotion/react", message: "CSS-in-JS is not allowed. Use styles/app.css." },
            { name: "@emotion/styled", message: "CSS-in-JS is not allowed. Use styles/app.css." },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      // Blocks <style> / <style jsx> elements inside components.
      "no-restricted-syntax": [
        "error",
        { selector: "JSXOpeningElement[name.name='style']", message: "<style> tags are not allowed. Use styles/app.css." },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
