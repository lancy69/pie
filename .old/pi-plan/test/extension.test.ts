import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import plan, { extractProposedPlan } from "../index.ts";

test("extractProposedPlan accepts only a non-empty tagged plan", () => {
	assert.equal(extractProposedPlan("before\n<proposed_plan>\n# Ship it\n</proposed_plan>"), "# Ship it");
	assert.equal(extractProposedPlan("<proposed_plan># Compact</proposed_plan>"), "# Compact");
	assert.equal(extractProposedPlan("<proposed_plan>   # Trimmed   </proposed_plan>"), "# Trimmed");
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
	const flags: [string, unknown][] = [];
	const commandDescriptions = new Map<string, string | undefined>();
	const entries = [...(options.entries ?? [])];
	const sent: string[] = [];
	const statuses: [string, string | undefined][] = [];
	const notices: [string, string | undefined][] = [];
	const selectCalls: [string, string[]][] = [];
	const inputCalls: string[] = [];
	const flagNames: string[] = [];
	const themeCalls: [string, string][] = [];
	const selections = [...(options.selections ?? [])];
	const inputs = [...(options.inputs ?? [])];
	let activeTools = options.activeTools ?? ["read", "bash", "edit", "write"];

	const api = {
		on(name: string, handler: Handler) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		},
		registerFlag(name: string, config: unknown) { flags.push([name, config]); },
		getFlag: (name: string) => { flagNames.push(name); return options.flag ?? false; },
		registerTool(tool: { name: string }) { tools.set(tool.name, tool); },
		registerCommand(name: string, command: { description?: string; handler: Handler }) {
			commands.set(name, command.handler);
			commandDescriptions.set(name, command.description);
		},
		getActiveTools: () => activeTools,
		setActiveTools(value: string[]) { activeTools = value; },
		appendEntry(customType: string, data: unknown) { entries.push({ type: "custom", customType, data }); },
		sendUserMessage(message: string) { sent.push(message); },
	} as unknown as ExtensionAPI;
	const ctx = {
		hasUI: options.hasUI ?? true,
		ui: {
			theme: { fg: (color: string, text: string) => { themeCalls.push([color, text]); return text; } },
			setStatus: (key: string, value: string | undefined) => statuses.push([key, value]),
			notify: (message: string, type?: string) => notices.push([message, type]),
			select: async (title: string, values: string[]) => {
				selectCalls.push([title, values]);
				return selections.shift();
			},
			input: async (title: string) => { inputCalls.push(title); return inputs.shift(); },
		},
		sessionManager: { getEntries: () => entries },
	};

	plan(api);
	return {
		commands,
		commandDescriptions,
		ctx,
		entries,
		flags,
		flagNames,
		handlers,
		inputCalls,
		notices,
		selectCalls,
		sent,
		statuses,
		themeCalls,
		tools,
		replaceActiveTools(value: string[]) { activeTools = value; },
		get activeTools() { return activeTools; },
	};
}

test("registers the model-facing Plan mode contract", () => {
	const env = setup();
	assert.deepEqual(env.flags, [["plan", {
		description: "Start in Plan mode",
		type: "boolean",
		default: false,
	}]]);
	assert.equal(env.commandDescriptions.get("plan"), "Enter or leave Codex-style Plan mode");
	const tool = env.tools.get("request_user_input");
	assert.equal(tool.label, "Request user input");
	assert.equal(tool.description, "Ask one to three short planning questions with meaningful choices. A free-form Other choice is added automatically.");
	assert.equal(tool.executionMode, "sequential");
	assert.deepEqual(tool.parameters, {
		type: "object",
		required: ["questions"],
		properties: {
			questions: {
				type: "array",
				minItems: 1,
				maxItems: 3,
				items: {
					type: "object",
					required: ["id", "header", "question", "options"],
					properties: {
						id: { type: "string", description: "Stable identifier for this question" },
						header: { type: "string", description: "Short header, 12 characters or fewer" },
						question: { type: "string", description: "A single-sentence question" },
						options: {
							type: "array",
							minItems: 2,
							maxItems: 3,
							items: {
								type: "object",
								required: ["label", "description"],
								properties: {
									label: { type: "string", description: "Short option label" },
									description: { type: "string", description: "One sentence explaining the impact or tradeoff" },
								},
							},
						},
					},
				},
			},
		},
	});
});

test("Plan mode changes tools and hands an approved plan to Default mode", async () => {
	const env = setup({
		activeTools: ["read", "bash", "edit", "write", "request_user_input"],
		selections: ["No, stay in Plan mode", "Yes, implement this plan"],
	});
	assert.deepEqual([...env.tools.keys()], ["request_user_input"]);
	await env.handlers.get("session_start")?.[0]?.({}, env.ctx);
	assert.deepEqual(env.activeTools, ["read", "bash", "edit", "write"]);
	assert.deepEqual(env.flagNames, ["plan"]);
	assert.deepEqual(env.statuses, [["pi-plan", undefined]]);
	assert.equal(await env.handlers.get("before_agent_start")?.[0]?.({ systemPrompt: "base" }, env.ctx), undefined);
	assert.equal((await env.handlers.get("tool_call")?.[0]?.({ toolName: "read" }, env.ctx)), undefined);
	assert.deepEqual(await env.handlers.get("tool_call")?.[0]?.({ toolName: "request_user_input" }, env.ctx), {
		block: true,
		reason: "request_user_input is available only in Plan mode.",
	});

	await env.commands.get("plan")?.("", env.ctx);
	assert.deepEqual(env.activeTools, ["read", "bash", "request_user_input"]);
	assert.deepEqual(env.entries.at(-1), {
		type: "custom",
		customType: "pi-plan-state",
		data: { enabled: true, toolsBeforePlanMode: ["read", "bash", "edit", "write"] },
	});
	assert.deepEqual(env.statuses.at(-1), ["pi-plan", "plan"]);
	assert.deepEqual(env.themeCalls, [["warning", "plan"]]);
	await env.commands.get("plan")?.("on", env.ctx);
	assert.equal(env.entries.length, 1);

	const prompt = await env.handlers.get("before_agent_start")?.[0]?.({ systemPrompt: "base" }, env.ctx);
	assert.match(prompt.systemPrompt, /^base\n\n<plan_mode>/);
	assert.match(prompt.systemPrompt, /decision-complete implementation plan/);
	assert.match(prompt.systemPrompt, /Do not edit files/);
	assert.match(prompt.systemPrompt, /<proposed_plan> and <\/proposed_plan>/);
	const blocked = await env.handlers.get("tool_call")?.[0]?.({ toolName: "edit" }, env.ctx);
	assert.deepEqual(blocked, {
		block: true,
		reason: "Plan mode blocks the edit tool. Use /plan off to leave Plan mode.",
	});
	assert.equal(await env.handlers.get("tool_call")?.[0]?.({ toolName: "read" }, env.ctx), undefined);

	await env.handlers.get("agent_end")?.[0]?.({ messages: [] }, env.ctx);
	await env.handlers.get("agent_end")?.[0]?.({ messages: [{ role: "assistant", content: "not blocks" }] }, env.ctx);
	await env.handlers.get("agent_end")?.[0]?.({
		messages: [{ role: "assistant", content: [{ type: "text", text: "<proposed_plan>\n# First\n</proposed_plan>" }] }],
	}, env.ctx);
	assert.deepEqual(env.activeTools, ["read", "bash", "request_user_input"]);
	assert.deepEqual(env.selectCalls.at(-1), ["Implement this plan?", [
		"Yes, implement this plan",
		"No, stay in Plan mode",
	]]);

	await env.handlers.get("agent_end")?.[0]?.({
		messages: [{ role: "assistant", content: [{ type: "text", text: "<proposed_plan>\n# Plan\n</proposed_plan>" }] }],
	}, env.ctx);
	assert.deepEqual(env.activeTools, ["read", "bash", "edit", "write"]);
	assert.deepEqual(env.sent, ["Implement the plan."]);
	assert.deepEqual(env.notices, [["Plan mode on.", "info"], ["Plan mode off.", "info"]]);
	assert.deepEqual(env.statuses.at(-1), ["pi-plan", undefined]);
	assert.deepEqual(env.entries.at(-1), {
		type: "custom",
		customType: "pi-plan-state",
		data: { enabled: false, toolsBeforePlanMode: undefined },
	});
	await env.commands.get("plan")?.("off", env.ctx);
});

test("Plan command accepts a task and restores persisted sessions", async () => {
	const task = setup();
	await task.handlers.get("session_start")?.[0]?.({}, task.ctx);
	await task.commands.get("plan")?.("Plan this feature", task.ctx);
	assert.deepEqual(task.sent, ["Plan this feature"]);
	assert.deepEqual(task.activeTools, ["read", "bash", "request_user_input"]);
	await task.commands.get("plan")?.("  off  ", task.ctx);
	assert.deepEqual(task.activeTools, ["read", "bash", "edit", "write"]);

	const resumed = setup({
		entries: [
			{
				type: "custom",
				customType: "pi-plan-state",
				data: { enabled: true, toolsBeforePlanMode: ["read", "edit", "write"] },
			},
			{ type: "custom", customType: "another-extension", data: { enabled: false } },
			{ type: "message", message: { role: "user", content: "hello" } },
		],
	});
	await resumed.handlers.get("session_start")?.[0]?.({}, resumed.ctx);
	assert.deepEqual(resumed.activeTools, ["read", "request_user_input"]);
	assert.deepEqual(resumed.statuses, [["pi-plan", "plan"]]);

	const flagged = setup({ flag: true, activeTools: ["read", "bash", "edit", "write", "request_user_input"] });
	await flagged.handlers.get("session_start")?.[0]?.({}, flagged.ctx);
	assert.deepEqual(flagged.activeTools, ["read", "bash", "request_user_input"]);
	assert.deepEqual(flagged.flagNames, ["plan"]);

	const reconfigured = setup();
	await reconfigured.handlers.get("session_start")?.[0]?.({}, reconfigured.ctx);
	reconfigured.replaceActiveTools(["read", "edit", "request_user_input"]);
	await reconfigured.commands.get("plan")?.("", reconfigured.ctx);
	assert.deepEqual(reconfigured.activeTools, ["read", "request_user_input"]);
	await reconfigured.commands.get("plan")?.("", reconfigured.ctx);
	assert.deepEqual(reconfigured.activeTools, ["read", "edit"]);
});

test("plan approval is offered only in interactive Plan mode", async () => {
	const proposedPlan = {
		messages: [{
			role: "assistant",
			content: [
				{ type: "image", data: "ignored", mimeType: "image/png" },
				{ type: "text", text: "<proposed_plan>" },
				{ type: "text", text: "# Valid plan\n</proposed_plan>" },
			],
		}],
	};
	const disabled = setup({ selections: ["Yes, implement this plan"] });
	await disabled.handlers.get("session_start")?.[0]?.({}, disabled.ctx);
	await disabled.handlers.get("agent_end")?.[0]?.(proposedPlan, disabled.ctx);
	assert.deepEqual(disabled.selectCalls, []);

	const nonInteractive = setup({ hasUI: false, selections: ["Yes, implement this plan"] });
	await nonInteractive.handlers.get("session_start")?.[0]?.({}, nonInteractive.ctx);
	await nonInteractive.commands.get("plan")?.("on", nonInteractive.ctx);
	await nonInteractive.handlers.get("agent_end")?.[0]?.(proposedPlan, nonInteractive.ctx);
	assert.deepEqual(nonInteractive.selectCalls, []);
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
	assert.deepEqual(unavailableResult, {
		content: [{ type: "text", text: "User input unavailable outside interactive mode." }],
		details: {},
	});

	const selected = setup({ selections: ["Small — Change one path."] });
	const selectedResult = await selected.tools.get("request_user_input").execute("2", params, undefined, undefined, selected.ctx);
	assert.deepEqual(selected.selectCalls, [["Scope\nWhich scope?", [
		"Small — Change one path.",
		"Large — Change all paths.",
		"Other",
	]]]);
	assert.deepEqual(selectedResult, {
		content: [{ type: "text", text: JSON.stringify({ answers: { scope: "Small" } }) }],
		details: { answers: { scope: "Small" } },
	});

	const custom = setup({ selections: ["Other"], inputs: ["  My scope  "] });
	const customResult = await custom.tools.get("request_user_input").execute("3", params, undefined, undefined, custom.ctx);
	assert.deepEqual(customResult.details.answers, { scope: "My scope" });
	assert.deepEqual(custom.inputCalls, ["Which scope?"]);

	const cancelled = setup({ selections: [undefined] });
	const cancelledResult = await cancelled.tools.get("request_user_input").execute("4", params, undefined, undefined, cancelled.ctx);
	assert.deepEqual(cancelledResult, {
		content: [{ type: "text", text: "The user cancelled the questions." }],
		details: { answers: {} },
	});

	const cancelledCustom = setup({ selections: ["Other"], inputs: [undefined] });
	const cancelledCustomResult = await cancelledCustom.tools.get("request_user_input").execute("5", params, undefined, undefined, cancelledCustom.ctx);
	assert.deepEqual(cancelledCustomResult.details.answers, {});

	const partial = setup({ selections: ["Small — Change one path.", undefined] });
	const partialResult = await partial.tools.get("request_user_input").execute("6", {
		questions: [...params.questions, { ...params.questions[0], id: "rollout", header: "Rollout" }],
	}, undefined, undefined, partial.ctx);
	assert.deepEqual(partialResult.details.answers, { scope: "Small" });
});
