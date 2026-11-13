import { readFileSync } from "node:fs";
import { createRef } from "react";
import { parse } from "postcss";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DisclosureSummary } from "../src/components/ui/disclosure";

it("keeps native disclosure focus, toggling and parent callbacks with a decorative chevron", async () => {
  const user = userEvent.setup();
  const toggled = vi.fn();
  const ref = createRef<HTMLElement>();
  render(<details onToggle={toggled}><DisclosureSummary ref={ref}>View registrations</DisclosureSummary><button>Export registrations</button></details>);
  const summary = screen.getByText("View registrations").closest("summary")!;
  const details = summary.parentElement as HTMLDetailsElement;
  expect(ref.current).toBe(summary);
  expect(summary.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
  expect(details.open).toBe(false);
  await user.tab();
  expect(document.activeElement).toBe(summary);
  await user.click(summary);
  expect(details.open).toBe(true);
  expect(screen.getByRole("button", { name: "Export registrations" })).toBeTruthy();
  await waitFor(() => expect(toggled).toHaveBeenCalled());
  await user.click(summary);
  expect(details.open).toBe(false);
});

it("keeps nested chevrons tied to their own disclosure state", async () => {
  const user = userEvent.setup();
  const styles = parse(readFileSync("src/index.css", "utf8"));
  let expandedIconSelector = "";
  styles.walkRules((rule) => {
    if (rule.nodes.some((node) => node.type === "decl" && node.prop === "transform" && node.value === "rotate(180deg)")) expandedIconSelector = rule.selector;
  });
  expect(expandedIconSelector).toBeTruthy();
  const { container } = render(<details open><DisclosureSummary>Moderation history</DisclosureSummary><details><DisclosureSummary>Submitted content</DisclosureSummary><p>Original submission</p></details></details>);
  const outer = screen.getByText("Moderation history").closest("summary")!;
  const inner = screen.getByText("Submitted content").closest("summary")!;
  const expandedIcons = () => [...container.querySelectorAll(expandedIconSelector)];
  expect(expandedIcons()).toEqual([outer.lastElementChild]);
  await user.click(inner);
  expect(expandedIcons()).toEqual([outer.lastElementChild, inner.lastElementChild]);
  await user.click(inner);
  expect(expandedIcons()).toEqual([outer.lastElementChild]);
  await user.click(outer);
  expect(expandedIcons()).toEqual([]);
});
