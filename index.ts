import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    ctx.ui.onTerminalInput((_data) => {
      // Skeleton: pass all input through unchanged.
      return undefined;
    });
  });

  pi.on("session_shutdown", () => {
    // Reset per-session state (added in later steps).
  });
}
