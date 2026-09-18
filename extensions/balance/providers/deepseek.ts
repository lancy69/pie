import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

interface BalanceResponse {
	is_available: boolean;
	balance_infos: Array<{
		currency: "CNY" | "USD";
		total_balance: string;
		granted_balance: string;
		topped_up_balance: string;
	}>;
}

export async function getDeepSeekBalance(ctx: ExtensionContext): Promise<string> {
	const credentials = await ctx.modelRegistry.getProviderAuth("deepseek");
	const token = credentials?.auth.apiKey;

	if (!token) {
		throw new Error("api key not configured");
	}

	const response = await fetch(
		"https://api.deepseek.com/user/balance",
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
		throw new Error(`http ${response.status}`);
	}

	const data = await response.json() as BalanceResponse;

	if (!data.is_available) {
		throw new Error("insufficient balance");
	}

	const balance = data.balance_infos
		.map(({ currency, total_balance }) => `${currency === "CNY" ? "¥" : "$"}${total_balance} total`)
		.join(" • ");

	if (!balance) {
		throw new Error("balance unavailable");
	}

	return balance;
}
