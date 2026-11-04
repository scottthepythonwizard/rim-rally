import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Confirmation from "@/features/checkout/confirmation";
import { getBooking, PAYMENT_RECOVERY } from "@/services/payment-operations";

vi.mock("@/services/payment-operations", () => ({ getBooking: vi.fn(), PAYMENT_RECOVERY: "test-payment-recovery" }));
vi.mock("@/features/checkout/ticket-qr", () => ({ default: ({ token, onReady }) => <button onClick={onReady}>Encode {token}</button> }));
const receipt = (id) => ({ id, reference: `RR-${id}`, guestName: "Demo Guest", context: { sport: "pickleball", date: "2030-01-01" }, facilityName: "Rim & Rally", courtName: "Court 1", slots: [{ startAt: "2030-01-01T08:00:00+08:00", endAt: "2030-01-01T09:00:00+08:00" }], amount: 40000, method: "gcash", ticketToken: `token-${id}` });
beforeEach(() => { vi.clearAllMocks(); sessionStorage.setItem(PAYMENT_RECOVERY, JSON.stringify({ credential: "secret" })); });

describe("confirmation navigation", () => {
  it("hides the previous ticket while a different booking is being checked", async () => {
    let rejectNext;
    getBooking.mockResolvedValueOnce(receipt("first")).mockImplementationOnce(() => new Promise((resolve, reject) => { rejectNext = reject; }));
    const view = render(<Confirmation bookingId="first" />);
    await screen.findByText("RR-first");
    view.rerender(<Confirmation bookingId="second" />);
    expect(screen.queryByText("RR-first")).not.toBeInTheDocument();
    await waitFor(() => expect(rejectNext).toBeTypeOf("function"));
    rejectNext(new Error("This pass cannot be verified."));
    await screen.findByRole("heading", { name: "Pass unavailable" });
    expect(screen.queryByLabelText("Digital booking pass")).not.toBeInTheDocument();
  });
  it("requires the new booking's QR before allowing print", async () => {
    getBooking.mockResolvedValueOnce(receipt("first")).mockResolvedValueOnce(receipt("second"));
    const view = render(<Confirmation bookingId="first" />);
    fireEvent.click(await screen.findByRole("button", { name: "Encode token-first" }));
    expect(screen.getByRole("button", { name: "Print / Save as PDF" })).toBeEnabled();
    view.rerender(<Confirmation bookingId="second" />);
    await screen.findByText("RR-second");
    expect(screen.getByRole("button", { name: "Print / Save as PDF" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Encode token-second" }));
    expect(screen.getByRole("button", { name: "Print / Save as PDF" })).toBeEnabled();
  });
});
