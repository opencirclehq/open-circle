import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { AccountCorner } from "../src/components/account-corner";
import { setLeaveGuard } from "../src/lib/leave-guard";

function Where() { return <p data-testid="path">{useLocation().pathname}</p>; }
afterEach(() => setLeaveGuard(null));

it("links home from the brand, asking first when the page has unsaved work", async () => {
  const user = userEvent.setup();
  const pending: { leave?: () => void } = {};
  setLeaveGuard((leave) => { pending.leave = leave; return true; });
  render(<MemoryRouter initialEntries={["/blog/write"]}><AccountCorner>{null}</AccountCorner><Where /></MemoryRouter>);
  const home = screen.getByRole("link", { name: "OpenCircle home" });
  expect(home.getAttribute("href")).toBe("/");
  await user.click(home);
  expect(screen.getByTestId("path").textContent).toBe("/blog/write");
  act(() => pending.leave!());
  expect(screen.getByTestId("path").textContent).toBe("/");
});
