import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isKeyRelease, matchesKey } from "@earendil-works/pi-tui";

/** Time window for a double-Esc press, matching pi's built-in double-escape interval. */
const DOUBLE_ESC_WINDOW_MS = 500;
const STATUS_KEY = "double-esc";

export default function (pi: ExtensionAPI) {
  let lastEscAt = 0;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;

  function clearHintTimer() {
    if (hintTimer !== undefined) {
      clearTimeout(hintTimer);
      hintTimer = undefined;
    }
  }

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    ctx.ui.onTerminalInput((data) => {
      // pi enables the Kitty keyboard protocol with event types, so input
      // listeners see key releases that components never do. Ignore them,
      // or one physical Esc press would look like two.
      if (isKeyRelease(data)) return undefined;

      if (!matchesKey(data, "escape")) return undefined;

      // Idle: leave Esc untouched (autocomplete/dialog cancel, bash-mode
      // exit, pi's built-in double-escape /tree, ...).
      if (ctx.isIdle()) {
        lastEscAt = 0;
        return undefined;
      }

      const now = Date.now();
      if (now - lastEscAt < DOUBLE_ESC_WINDOW_MS) {
        // Second press within the window: pass through so pi's built-in
        // abort handles it exactly as it would without this extension.
        lastEscAt = 0;
        clearHintTimer();
        ctx.ui.setStatus(STATUS_KEY, undefined);
        return undefined;
      }

      // First press while busy: swallow it and show the hint.
      lastEscAt = now;
      ctx.ui.setStatus(STATUS_KEY, "Press Esc again to interrupt");
      clearHintTimer();
      hintTimer = setTimeout(() => {
        hintTimer = undefined;
        ctx.ui.setStatus(STATUS_KEY, undefined);
      }, DOUBLE_ESC_WINDOW_MS);
      return { consume: true };
    });
  });

  pi.on("session_shutdown", () => {
    // Clear the timer so it never fires against a stale ctx after pi
    // tears down this session's extension runtime.
    lastEscAt = 0;
    clearHintTimer();
  });
}
