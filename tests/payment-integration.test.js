import { expect, test } from "vitest";
import { normalizeError } from "@/services/http/api-client";

test("payment field validation preserves DRF field messages", () => {
  const error = normalizeError({ reference: ["This field is required."], proof: ["Use a PNG or JPEG."] }, 400);
  expect(error.fieldErrors).toEqual({ reference: "This field is required.", proof: "Use a PNG or JPEG." });
  expect(error.message).toBe("Check the highlighted fields.");
});

test("payment conflicts preserve the server's safe explanation", () => {
  expect(normalizeError({ detail: "Only an unpaid booking can be cancelled here." }, 409).message).toBe("Only an unpaid booking can be cancelled here.");
  expect(normalizeError({ error: { code: "HOLD_EXPIRED", message: "Your hold expired." } }, 410)).toMatchObject({ code: "HOLD_EXPIRED", message: "Your hold expired." });
  expect(normalizeError({ detail: "PRIVATE SERVER DETAILS" }, 500).message).not.toContain("PRIVATE");
});
