/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  clearMocks: true,
  // expo-server-sdk ships ESM-only output (a bare `import` statement) that
  // ts-jest's default transform (registered only for .ts/.tsx) doesn't
  // touch, and node_modules is untransformed by default anyway  every test
  // whose import chain reaches services/push.ts transitively (most of the
  // route tree, via notify.ts) would otherwise fail to even load, despite
  // none of the current tests exercising push-sending itself. Mapped to a
  // minimal manual mock instead of fighting the transform pipeline for one
  // dependency.
  moduleNameMapper: {
    "^expo-server-sdk$": "<rootDir>/src/__mocks__/expo-server-sdk.ts",
  },
};
