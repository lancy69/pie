import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isKeyRelease, isKeyRepeat, matchesKey } from "@earendil-works/pi-tui";

const TIMEOUT_MS = 500;

export default function (pi: ExtensionAPI) {
	let deadline = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function reset(ctx: ExtensionContext): void {
		deadline = 0;
		if (timer === undefined) return;
		clearTimeout(timer);
		timer = undefined;
		ctx.ui.setWorkingMessage();
	}

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			class DoubleEscEditor extends CustomEditor {
				override handleInput(data: string): void {
					if (ctx.isIdle() || this.isShowingAutocomplete()) {
						reset(ctx);
					} else if (matchesKey(data, "escape")) {
						if (isKeyRelease(data) || isKeyRepeat(data)) return;
						const now = performance.now();
						if (now < deadline) {
							reset(ctx);
						} else {
							reset(ctx);
							deadline = now + TIMEOUT_MS;
							ctx.ui.setWorkingMessage("Press Esc again to interrupt");
							timer = setTimeout(() => reset(ctx), TIMEOUT_MS);
							return;
						}
					}
					super.handleInput(data);
				}
			}
			return new DoubleEscEditor(tui, theme, keybindings, { embedWorkingStatus: true });
		});
	});

	pi.on("agent_settled", (_event, ctx) => reset(ctx));
	pi.on("session_shutdown", (_event, ctx) => reset(ctx));
}
