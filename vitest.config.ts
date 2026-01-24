import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        // Backend (Worker) tests - Node environment, no setup file
        extends: true,
        test: {
          name: "backend",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // Frontend tests - jsdom environment with browser mocks
        extends: true,
        test: {
          name: "frontend",
          include: ["frontend/src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./frontend/src/__tests__/setup.ts"],
        },
      },
    ],
  },
});
