import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SlotButton } from "@/features/booking/booking-matrix";
import OpenPlay from "@/features/booking/open-play";
import { mockAvailability, mockOpenPlay } from "@/mocks/scheduling";

const query = { facilityId: "rim-and-rally", sport: "pickleball", date: "2030-01-01" };
describe("booking controls", () => {
  it("exposes selection and disables unavailable slots accessibly", () => {
    const slot = mockAvailability(query).courts[0].slots[0];
    const onSelect = vi.fn();
    const { rerender } = render(<SlotButton slot={{ ...slot, status: "available" }} courtName="Court 1" now={0} selected onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: /Court 1.*Held for you/ });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button); expect(onSelect).toHaveBeenCalledTimes(1);
    rerender(<SlotButton slot={{ ...slot, status: "held" }} courtName="Court 1" now={0} selected={false} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /Court 1.*Held/ })).toBeDisabled();
  });
  it("shows a final Open Play place and prevents selecting full sessions", () => {
    const data = mockOpenPlay(query);
    const onSelect = vi.fn();
    render(<OpenPlay sessions={data.sessions} now={0} onSelect={onSelect} />);
    expect(screen.getByText("1 place remaining")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Full" })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Select one place" })[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
