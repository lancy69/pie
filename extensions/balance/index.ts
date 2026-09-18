import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { getDeepSeekBalance } from "./providers/deepseek.ts"
import { getCodexBalance } from "./providers/openai-codex.ts"

async function getBalance(ctx: ExtensionContext): Promise<string> {
	switch (ctx.model?.provider) {
		case "deepseek":
			return getDeepSeekBalance(ctx)
		case "openai-codex":
			return getCodexBalance(ctx);
		default:
			return "not supported";
	}
}

async function refreshBalanceFooter(ctx: ExtensionContext): Promise<void> {
	try {
		const balance = await getBalance(ctx);
		ctx.ui.setStatus("balance", balance);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		ctx.ui.setStatus("balance", ctx.ui.theme.fg("error", message));
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => refreshBalanceFooter(ctx));
	pi.on("agent_settled", async (_event, ctx) => refreshBalanceFooter(ctx));
	pi.on("model_select", async (_event, ctx) => refreshBalanceFooter(ctx));
}
