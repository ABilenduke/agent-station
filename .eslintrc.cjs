module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
  },
  extends: ["eslint:recommended", "plugin:prettier/recommended"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "script",
  },
  ignorePatterns: ["node_modules/", "/references/", ".vscode/", "README*.md"],
  overrides: [
    {
      files: ["*.mjs"],
      parserOptions: { sourceType: "module" },
      rules: { "prettier/prettier": "off" },
    },
  ],
};
