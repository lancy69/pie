import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

interface UsageResponse {
	rate_limit: {
		primary_window: { used_percent: number },
		secondary_window: { used_percent: number },
	};
}

export async function getCodexBalance(ctx: ExtensionContext): Promise<string> {
	const credentials = await ctx.modelRegistry.getProviderAuth("openai-codex")
	const token = credentials?.auth.apiKey;

	if (!token) {
		throw new Error("not signed in");
	}

	const response = await fetch(
		"https://chatgpt.com/backend-api/wham/usage",
		{
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
			},
			signal: AbortSignal.timeout(10000),
			redirect: "error",
		},
	);

	if (!response.ok) {
		throw new Error(`https ${response.status}`);
	}

	const { rate_limit } = await response.json() as UsageResponse;

	return [
		`${100 - rate_limit.primary_window.used_percent}% 5h`,
		`${100 - rate_limit.secondary_window.used_percent}% weekly`,
	].join(" • ");
}
