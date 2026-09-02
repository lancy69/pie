import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import plan, { extractProposedPlan, PLAN_MODE_PROMPT } from "../index.ts";

test("extractProposedPlan accepts only a non-empty tagged plan", () => {
	assert.equal(extractProposedPlan("before\n<proposed_plan>\n# Ship it\n</proposed_plan>"), "# Ship it");
	assert.equal(extractProposedPlan("<proposed_plan> </proposed_plan>"), undefined);
	assert.equal(extractProposedPlan("# Untagged"), undefined);
});

type Handler = (...args: any[]) => any;

function setup(options: {
	activeTools?: string[];
	entries?: any[];
	flag?: boolean;
	hasUI?: boolean;
	selections?: (string | undefined)[];
	inputs?: (string | undefined)[];
} = {}) {
	const handlers = new Map<string, Handler[]>();
	const commands = new Map<string, Handler>();
	const tools = new Map<string, any>();
	const entries = [...(options.entries ?? [])];
	const sent: string[] = [];
	const statuses: (string | undefined)[] = [];
	const notices: string[] = [];
	const selections = [...(options.selections ?? [])];
	const inputs = [...(options.inputs ?? [])];
	let activeTools = options.activeTools ?? ["read", "bash", "edit", "write"];

	const api = {
		on(name: string, handler: Handler) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		},
		registerFlag() {},
		getFlag: () => options.flag ?? false,
		registerTool(tool: { name: string }) { tools.set(tool.name, tool); },
		registerCommand(name: string, command: { handler: Handler }) { commands.set(name, command.handler); },
		getActiveTools: () => activeTools,
		setActiveTools(value: string[]) { activeTools = value; },
		appendEntry(customType: string, data: unknown) { entries.push({ type: "custom", customType, data }); },
		sendUserMessage(message: string) { sent.push(message); },
	} as unknown as ExtensionAPI;
	const ctx = {
		hasUI: options.hasUI ?? true,
		ui: {
			theme: { fg: (_color: string, text: string) => text },
			setStatus: (_key: string, value: string | undefined) => statuses.push(value),
			notify: (message: string) => notices.push(message),
			select: async () => selections.shift(),
			input: async () => inputs.shift(),
		},
		sessionManager: { getEntries: () => entries },
	};

	plan(api);
	return {
		commands,
		ctx,
		entries,
		handlers,
		notices,
		sent,
		statuses,
		tools,
		get activeTools() { return activeTools; },
	};
}

test("Plan mode changes tools and hands an approved plan to Default mode", async () => {
	const env = setup({ selections: ["No, stay in Plan mode", "Yes, implement this plan"] });
	assert.deepEqual([...env.tools.keys()], ["request_user_input"]);
	await env.handlers.get("session_start")?.[0]?.({}, env.ctx);
	assert.deepEqual(env.activeTools, ["read", "bash", "edit", "write"]);
	assert.equal(await env.handlers.get("before_agent_start")?.[0]?.({ systemPrompt: "base" }, env.ctx), undefined);
	assert.equal((await env.handlers.get("tool_call")?.[0]?.({ toolName: "read" }, env.ctx)), undefined);
	assert.equal((await env.handlers.get("tool_call")?.[0]?.({ toolName: "request_user_input" }, env.ctx)).block, true);

	await env.commands.get("plan")?.("", env.ctx);
	assert.deepEqual(env.activeTools, ["read", "bash", "request_user_input"]);
	await env.commands.get("plan")?.("on", env.ctx);

	const prompt = await env.handlers.get("before_agent_start")?.[0]?.({ systemPrompt: "base" }, env.ctx);
	assert.equal(prompt.systemPrompt, `base\n\n${PLAN_MODE_PROMPT}`);
	const blocked = await env.handlers.get("tool_call")?.[0]?.({ toolName: "edit" }, env.ctx);
	assert.equal(blocked.block, true);
	assert.equal(await env.handlers.get("tool_call")?.[0]?.({ toolName: "read" }, env.ctx), undefined);

	await env.handlers.get("agent_end")?.[0]?.({ messages: [{ role: "assistant", content: "not blocks" }] }, env.ctx);
	await env.handlers.get("agent_end")?.[0]?.({
		messages: [{ role: "assistant", content: [{ type: "text", text: "<proposed_plan>\n# First\n</proposed_plan>" }] }],
	}, env.ctx);
	assert.deepEqual(env.activeTools, ["read", "bash", "request_user_input"]);

	await env.handlers.get("agent_end")?.[0]?.({
		messages: [{ role: "assistant", content: [{ type: "text", text: "<proposed_plan>\n# Plan\n</proposed_plan>" }] }],
	}, env.ctx);
	assert.deepEqual(env.activeTools, ["read", "bash", "edit", "write"]);
	assert.deepEqual(env.sent, ["Implement the plan."]);
	assert.deepEqual(env.notices, ["Plan mode on.", "Plan mode off."]);
	await env.commands.get("plan")?.("off", env.ctx);
});

test("Plan command accepts a task and restores persisted sessions", async () => {
	const task = setup();
	await task.handlers.get("session_start")?.[0]?.({}, task.ctx);
	await task.commands.get("plan")?.("Plan this feature", task.ctx);
	assert.deepEqual(task.sent, ["Plan this feature"]);
	await task.commands.get("plan")?.("off", task.ctx);

	const resumed = setup({
		entries: [{
			type: "custom",
			customType: "pi-plan-state",
			data: { enabled: true, toolsBeforePlanMode: ["read", "edit", "write"] },
		}],
	});
	await resumed.handlers.get("session_start")?.[0]?.({}, resumed.ctx);
	assert.deepEqual(resumed.activeTools, ["read", "request_user_input"]);

	const flagged = setup({ flag: true });
	await flagged.handlers.get("session_start")?.[0]?.({}, flagged.ctx);
	assert.deepEqual(flagged.activeTools, ["read", "bash", "request_user_input"]);
});

test("request_user_input handles choices, custom answers, and cancellation", async () => {
	const params = {
		questions: [{
			id: "scope",
			header: "Scope",
			question: "Which scope?",
			options: [
				{ label: "Small", description: "Change one path." },
				{ label: "Large", description: "Change all paths." },
			],
		}],
	};

	const unavailable = setup({ hasUI: false });
	const unavailableResult = await unavailable.tools.get("request_user_input").execute("1", params, undefined, undefined, unavailable.ctx);
	assert.match(unavailableResult.content[0].text, /unavailable/);

	const selected = setup({ selections: ["Small — Change one path."] });
	const selectedResult = await selected.tools.get("request_user_input").execute("2", params, undefined, undefined, selected.ctx);
	assert.deepEqual(selectedResult.details.answers, { scope: "Small" });

	const custom = setup({ selections: ["Other"], inputs: ["My scope"] });
	const customResult = await custom.tools.get("request_user_input").execute("3", params, undefined, undefined, custom.ctx);
	assert.deepEqual(customResult.details.answers, { scope: "My scope" });

	const cancelled = setup({ selections: [undefined] });
	const cancelledResult = await cancelled.tools.get("request_user_input").execute("4", params, undefined, undefined, cancelled.ctx);
	assert.match(cancelledResult.content[0].text, /cancelled/);

	const cancelledCustom = setup({ selections: ["Other"], inputs: [" "] });
	const cancelledCustomResult = await cancelledCustom.tools.get("request_user_input").execute("5", params, undefined, undefined, cancelledCustom.ctx);
	assert.match(cancelledCustomResult.content[0].text, /cancelled/);
});
