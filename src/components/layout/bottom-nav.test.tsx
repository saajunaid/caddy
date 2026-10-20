import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activeNavItem, isUnderMore } from "@/modules/nav";
import { BottomNav } from "./bottom-nav";

let mockPath = "/";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

afterEach(() => {
  mockPath = "/";
});

describe("nav helpers", () => {
  it("matches the longest prefix", () => {
    expect(activeNavItem("/")?.id).toBe("today");
    expect(activeNavItem("/housing")?.id).toBe("housing");
    expect(activeNavItem("/housing/riverside")?.id).toBe("housing");
    expect(activeNavItem("/housingx")).toBeUndefined();
  });

  it("puts desktop-only sections under More on phones", () => {
    expect(isUnderMore("/travel")).toBe(true);
    expect(isUnderMore("/settings")).toBe(true);
    expect(isUnderMore("/more")).toBe(true);
    expect(isUnderMore("/money")).toBe(false);
  });
});

describe("BottomNav", () => {
  it("shows five tabs and marks the current one", () => {
    mockPath = "/money";
    render(<BottomNav />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Today",
      "Housing",
      "Money",
      "Family",
      "More",
    ]);
    expect(screen.getByRole("link", { name: "Money" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("highlights More for travel and settings", () => {
    mockPath = "/travel";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "More" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
