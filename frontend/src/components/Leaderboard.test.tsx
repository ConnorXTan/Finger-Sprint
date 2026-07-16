// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// Regression: off-board pinned row + empty state (design doc F7 / F4)
// Found by /qa on 2026-07-16

vi.mock("../net/gameClient", () => ({ getLeaderboard: vi.fn() }));
import { getLeaderboard } from "../net/gameClient";
import { Leaderboard } from "./Leaderboard";

afterEach(cleanup);

const board = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  name: `p${i + 1}`,
  score: 1000 - i * 50,
  distance: 100,
  createdAt: "2026-07-16T00:00:00Z",
  rank: i + 1,
}));

describe("Leaderboard", () => {
  it("pins an off-board entry below the list with the gap caption", async () => {
    vi.mocked(getLeaderboard).mockResolvedValue({ entries: board });
    render(<Leaderboard highlightId={99} pinned={{ name: "me", score: 400, rank: 14 }} />);
    await waitFor(() => expect(screen.getByText("#14")).toBeTruthy());
    expect(screen.getByText("me")).toBeTruthy();
    // gap = last on board (550) - mine (400) = 150
    expect(screen.getByText("150 to catch #10")).toBeTruthy();
  });

  it("does not duplicate an entry that made the board", async () => {
    vi.mocked(getLeaderboard).mockResolvedValue({ entries: board });
    render(<Leaderboard highlightId={3} pinned={{ name: "p3", score: 900, rank: 3 }} />);
    await waitFor(() => expect(screen.getAllByText("p3")).toHaveLength(1));
    expect(screen.queryByText(/to catch #10/)).toBeNull();
  });

  it("hides the gap caption when the board is shorter than the limit", async () => {
    vi.mocked(getLeaderboard).mockResolvedValue({ entries: board.slice(0, 4) });
    render(<Leaderboard highlightId={99} pinned={{ name: "me", score: 1, rank: 5 }} />);
    await waitFor(() => expect(screen.getByText("#5")).toBeTruthy());
    expect(screen.queryByText(/to catch #10/)).toBeNull();
  });

  it("renders the designed empty state, never a bare box", async () => {
    vi.mocked(getLeaderboard).mockResolvedValue({ entries: [] });
    render(<Leaderboard />);
    await waitFor(() =>
      expect(screen.getByText("nobody has run yet — be the first name here")).toBeTruthy(),
    );
  });
});
