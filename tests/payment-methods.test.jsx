import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PaymentMethods from "@/features/checkout/payment-methods";

describe("payment method preview", () => {
  it("allows accessible method selection while payment submission remains disabled", () => {
    render(<PaymentMethods holdValid />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: /Maya/ }));
    expect(screen.getByRole("radio", { name: /Maya/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /GCash/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Continue to payment", exact: true })).toBeDisabled();
  });
  it("disables choices when the hold has not been verified", () => {
    render(<PaymentMethods holdValid={false} />);
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });
});
