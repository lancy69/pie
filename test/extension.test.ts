import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import plan, { extractProposedPlan, PLAN_MODE_PROMPT } from "../index.ts";

test("extractProposedPlan accepts only a non-empty tagged plan", () => {
	assert.equal(extractProposedPlan("before\n<proposed_plan>\n# Ship it\n</proposed_plan>"), "# Ship it");
	assert.equal(extractProposedPlan("<proposed_plan> </proposed_plan>"), undefined);
	assert.equal(extractProposedPlan("# Untagged"), undefined);
});

test("Plan mode changes tools and hands an approved plan to Default mode", async () => {
	type Handler = (event: any, ctx: any) => any;
	const handlers = new Map<string, Handler[]>();
	const commands = new Map<string, Handler>();
	const tools: string[] = [];
	const entries: any[] = [];
	const sent: string[] = [];
	let activeTools = ["read", "bash", "edit", "write"];
	let selection = "No, stay in Plan mode";

	const api = {
		on(name: string, handler: Handler) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		},
		registerFlag() {},
		getFlag: () => false,
		registerTool(tool: { name: string }) { tools.push(tool.name); },
		registerCommand(name: string, command: { handler: Handler }) { commands.set(name, command.handler); },
		getActiveTools: () => activeTools,
		setActiveTools(value: string[]) { activeTools = value; },
		appendEntry(customType: string, data: unknown) { entries.push({ type: "custom", customType, data }); },
		sendUserMessage(message: string) { sent.push(message); },
	} as unknown as ExtensionAPI;
	const ctx = {
		hasUI: true,
		ui: {
			theme: { fg: (_color: string, text: string) => text },
			setStatus() {},
			notify() {},
			select: async () => selection,
		},
		sessionManager: { getEntries: () => entries },
	};

	plan(api);
	assert.deepEqual(tools, ["request_user_input"]);
	await handlers.get("session_start")?.[0]?.({}, ctx);
	await commands.get("plan")?.("", ctx);
	assert.deepEqual(activeTools, ["read", "bash", "request_user_input"]);

	const prompt = await handlers.get("before_agent_start")?.[0]?.({ systemPrompt: "base" }, ctx);
	assert.equal(prompt.systemPrompt, `base\n\n${PLAN_MODE_PROMPT}`);
	const blocked = await handlers.get("tool_call")?.[0]?.({ toolName: "edit" }, ctx);
	assert.equal(blocked.block, true);

	selection = "Yes, implement this plan";
	await handlers.get("agent_end")?.[0]?.({
		messages: [{ role: "assistant", content: [{ type: "text", text: "<proposed_plan>\n# Plan\n</proposed_plan>" }] }],
	}, ctx);
	assert.deepEqual(activeTools, ["read", "bash", "edit", "write"]);
	assert.deepEqual(sent, ["Implement the plan."]);
});
