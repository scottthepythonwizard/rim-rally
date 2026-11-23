import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
process.env.NEXT_PUBLIC_API_MODE = "mock";
process.env.NEXT_PUBLIC_BACKEND_ENABLED = "0";
afterEach(cleanup);
