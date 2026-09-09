import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isKeyRelease, matchesKey } from "@earendil-works/pi-tui";

/** Time window for a double-Esc press (deliberately more forgiving than pi's built-in 500ms double-escape interval). */
const DOUBLE_ESC_WINDOW_MS = 1000;
const HINT_MESSAGE = "Press Esc again to interrupt";

type InputResult = { consume: true } | undefined;

export default function (pi: ExtensionAPI) {
  let lastEscAt = 0;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let hintActive = false;

  function clearHintTimer(): void {
    if (hintTimer === undefined) return;
    clearTimeout(hintTimer);
    hintTimer = undefined;
  }

  function restoreWorkingMessage(ctx: ExtensionContext): void {
    hintActive = false;
    ctx.ui.setWorkingMessage();
  }

  function onHintExpired(ctx: ExtensionContext): void {
    hintTimer = undefined;
    restoreWorkingMessage(ctx);
  }

  // pi enables the Kitty keyboard protocol with event types, so input
  // listeners see key releases that components never do. Ignore them,
  // or one physical Esc press would look like two.
  function isEscPress(data: string): boolean {
    return !isKeyRelease(data) && matchesKey(data, "escape");
  }

  // Second press within the window: pass through so pi's built-in
  // abort handles it exactly as it would without this extension.
  function acceptSecondEsc(ctx: ExtensionContext): InputResult {
    lastEscAt = 0;
    clearHintTimer();
    restoreWorkingMessage(ctx);
    return undefined;
  }

  // First press while busy: swallow it and show the hint in place of the
  // busy indicator's message. That indicator is already visible while
  // tasks run, so the hint blends in without adding any lines.
  function armHint(now: number, ctx: ExtensionContext): InputResult {
    lastEscAt = now;
    hintActive = true;
    ctx.ui.setWorkingMessage(HINT_MESSAGE);
    clearHintTimer();
    hintTimer = setTimeout(() => onHintExpired(ctx), DOUBLE_ESC_WINDOW_MS);
    return { consume: true };
  }

  function handleBusyEsc(ctx: ExtensionContext): InputResult {
    const now = Date.now();
    if (now - lastEscAt < DOUBLE_ESC_WINDOW_MS) return acceptSecondEsc(ctx);
    return armHint(now, ctx);
  }

  // Idle: leave Esc untouched (autocomplete/dialog cancel, bash-mode
  // exit, pi's built-in double-escape /tree, ...).
  function handleEscPress(ctx: ExtensionContext): InputResult {
    if (ctx.isIdle()) {
      lastEscAt = 0;
      return undefined;
    }
    return handleBusyEsc(ctx);
  }

  function handleTerminalInput(data: string, ctx: ExtensionContext): InputResult {
    if (!isEscPress(data)) return undefined;
    return handleEscPress(ctx);
  }

  function dismissTuiHint(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui") return;
    restoreWorkingMessage(ctx);
  }

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.onTerminalInput((data) => handleTerminalInput(data, ctx));
  });

  pi.on("agent_settled", (_event, ctx) => {
    // If a run settles while the hint is armed, restore the default working
    // message so the hint can't leak into the next run's indicator. Only
    // touch the working message when our hint set it.
    clearHintTimer();
    if (hintActive) dismissTuiHint(ctx);
  });

  pi.on("session_shutdown", () => {
    // Clear the timer so it never fires against a stale ctx after pi
    // tears down this session's extension runtime.
    lastEscAt = 0;
    clearHintTimer();
  });
}
