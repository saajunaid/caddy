import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewForm, type ReviewFormProps } from "./review-form";

vi.mock("../actions", () => ({ saveReviewAction: vi.fn(async () => ({})) }));

const props = (over: Partial<ReviewFormProps> = {}): ReviewFormProps => ({
  documentId: "0f0e0d0c-2222-4b3a-8c1d-abcdefabcdef",
  currency: "EUR",
  alreadyConfirmed: false,
  fields: [
    {
      key: "supplier",
      value: "Electric Ireland",
      confirmed: false,
      confidence: "high",
    },
    {
      key: "total_cents",
      value: 21248,
      confirmed: false,
      confidence: "high",
      snippet: "Total Amount Due €212.48",
    },
    {
      key: "standing_charge_cents",
      value: null,
      confirmed: false,
      confidence: "low",
      candidates: [1781, 2135],
    },
    {
      key: "account_number_masked",
      value: "•••• 4821",
      confirmed: false,
      confidence: "high",
    },
  ],
  expense: {
    enabled: true,
    category: "utilities_electricity",
    paymentStatus: "unknown",
    isRecurring: true,
  },
  tax: {
    enabled: false,
    year: 2026,
    years: [2027, 2026, 2025],
    category: "remote_working_electricity",
    amount: "",
    members: [
      {
        id: "8e7f2a8e-1111-4c3b-9a1e-1234567890ab",
        name: "Junaid",
        checked: true,
        share: "100",
      },
      {
        id: "8e7f2a8e-2222-4c3b-9a1e-1234567890ab",
        name: "Ammara",
        checked: false,
        share: "100",
      },
    ],
  },
  ...over,
});

const payload = (container: HTMLElement) =>
  JSON.parse(
    (container.querySelector('input[name="payload"]') as HTMLInputElement)
      .value,
  );

describe("ReviewForm", () => {
  it("shows proposed values with confidence and provenance, masked identifiers only", () => {
    render(<ReviewForm {...props()} />);
    expect(screen.getByText("€212.48")).toBeInTheDocument();
    expect(screen.getByText("•••• 4821")).toBeInTheDocument();
    expect(screen.getAllByText("Proposed").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("img", { name: "High confidence" }).length).toBe(
      3,
    );
    expect(screen.getByText("3 to confirm")).toBeInTheDocument();
  });

  it("can't save until every proposed value is confirmed; Confirm all enables it", () => {
    render(<ReviewForm {...props()} />);
    const save = screen.getByRole("button", { name: "Save and link" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm all" }));
    expect(screen.getByText("All checked")).toBeInTheDocument();
    expect(save).toBeEnabled();
    expect(screen.getAllByText("You").length).toBe(3);
  });

  it("offers several found values as choices instead of guessing", () => {
    const { container } = render(<ReviewForm {...props()} />);
    expect(screen.getByText("Several found: choose one")).toBeInTheDocument();
    const choices = screen.getByRole("group", {
      name: "Choose Standing charge",
    });
    fireEvent.click(within(choices).getByRole("button", { name: "€21.35" }));
    expect(payload(container).fields.standing_charge_cents).toBe("21.35");
  });

  it("validates edits and stores identifiers masked", () => {
    const { container } = render(<ReviewForm {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Total due" }));
    fireEvent.change(screen.getByLabelText("Total due"), {
      target: { value: "12.345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter an amount like 212.48",
    );
    fireEvent.change(screen.getByLabelText("Total due"), {
      target: { value: "199.99" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(payload(container).fields.total_cents).toBe("199.99");

    fireEvent.click(screen.getByRole("button", { name: "Edit Account" }));
    fireEvent.change(screen.getByLabelText("Account"), {
      target: { value: "9 1234 9999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(payload(container).fields.account_number_masked).toBe("•••• 9999");
    expect(container.innerHTML).not.toContain("9 1234 9999");
  });

  it("tax evidence needs at least one person and sends their shares", () => {
    const { container } = render(<ReviewForm {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm all" }));
    fireEvent.click(screen.getByLabelText(/Tax evidence/));
    fireEvent.click(screen.getByLabelText("Junaid"));
    expect(screen.getByText("Choose at least one person.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save and link" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Ammara"));
    fireEvent.change(
      screen.getByLabelText("Ammara's share of this bill, percent"),
      {
        target: { value: "50" },
      },
    );
    expect(payload(container).tax).toMatchObject({
      enabled: true,
      year: 2026,
      members: [
        {
          memberId: "8e7f2a8e-2222-4c3b-9a1e-1234567890ab",
          sharePercent: "50",
        },
      ],
    });
  });
});
