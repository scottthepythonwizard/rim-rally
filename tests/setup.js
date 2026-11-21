import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
process.env.NEXT_PUBLIC_API_MODE = "mock";
afterEach(cleanup);
