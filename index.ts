import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const STATE_TYPE = "pi-plan-state";
const QUESTION_TOOL = "request_user_input";
const WRITE_TOOLS = new Set(["edit", "write"]);

export const PLAN_MODE_PROMPT = `<plan_mode>
You are in Plan mode until the user explicitly leaves it. Imperative language asks you to plan, not implement.

Work conversationally toward a decision-complete implementation plan in three phases:
1. Ground in the environment. Inspect relevant files and resolve discoverable facts before asking questions.
2. Clarify intent. Establish the goal, success criteria, scope, constraints, and meaningful preferences.
3. Clarify implementation. Resolve the approach, interfaces, data flow, edge cases, compatibility, and tests.

Plan mode is read-only. You may inspect and search, run non-mutating checks, and use request_user_input. Do not edit files, run commands that change repository-tracked state, install dependencies, commit, or otherwise implement the work.

Ask only questions whose answers materially affect the plan and cannot be discovered locally. Prefer request_user_input with 2-3 meaningful, mutually exclusive options and put the recommended option first. Use a direct question only when choices would be artificial.

When the plan is decision complete, return exactly one concise plan wrapped in <proposed_plan> and </proposed_plan>, with each tag on its own line. Include a title, summary, key implementation changes, test cases, and explicit assumptions. Do not ask whether to proceed.
</plan_mode>`;

const Option = Type.Object({
	label: Type.String({ description: "Short option label" }),
	description: Type.String({ description: "One sentence explaining the impact or tradeoff" }),
});

const Question = Type.Object({
	id: Type.String({ description: "Stable identifier for this question" }),
	header: Type.String({ description: "Short header, 12 characters or fewer" }),
	question: Type.String({ description: "A single-sentence question" }),
	options: Type.Array(Option, { minItems: 2, maxItems: 3 }),
});

const RequestUserInput = Type.Object({
	questions: Type.Array(Question, { minItems: 1, maxItems: 3 }),
});

type PlanState = { enabled: boolean; toolsBeforePlanMode?: string[] };

export function extractProposedPlan(text: string): string | undefined {
	return text.match(/<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/i)?.[1]?.trim() || undefined;
}

function lastAssistantText(messages: unknown[]): string {
	const message = [...messages].reverse().find((value) =>
		typeof value === "object" && value !== null && "role" in value && value.role === "assistant"
	) as { content?: unknown } | undefined;
	if (!Array.isArray(message?.content)) return "";
	return message.content
		.filter((part): part is { type: "text"; text: string } =>
			typeof part === "object" && part !== null && "type" in part && part.type === "text" &&
			"text" in part && typeof part.text === "string"
		)
		.map((part) => part.text)
		.join("\n");
}

export default function plan(pi: ExtensionAPI): void {
	let enabled = false;
	let toolsBeforePlanMode: string[] | undefined;

	const setStatus = (ctx: ExtensionContext) =>
		ctx.ui.setStatus("pi-plan", enabled ? ctx.ui.theme.fg("warning", "plan") : undefined);

	const persist = () => pi.appendEntry<PlanState>(STATE_TYPE, { enabled, toolsBeforePlanMode });

	function setEnabled(next: boolean, ctx: ExtensionContext): void {
		if (next === enabled) return;
		if (next) {
			toolsBeforePlanMode = pi.getActiveTools().filter((name) => name !== QUESTION_TOOL);
			pi.setActiveTools([
				...toolsBeforePlanMode.filter((name) => !WRITE_TOOLS.has(name)),
				QUESTION_TOOL,
			]);
		} else {
			pi.setActiveTools(toolsBeforePlanMode ?? pi.getActiveTools().filter((name) => name !== QUESTION_TOOL));
			toolsBeforePlanMode = undefined;
		}
		enabled = next;
		setStatus(ctx);
		persist();
		ctx.ui.notify(`Plan mode ${enabled ? "on" : "off"}.`, "info");
	}

	pi.registerFlag("plan", {
		description: "Start in Plan mode",
		type: "boolean",
		default: false,
	});

	pi.registerTool({
		name: QUESTION_TOOL,
		label: "Request user input",
		description: "Ask one to three short planning questions with meaningful choices. A free-form Other choice is added automatically.",
		parameters: RequestUserInput,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return { content: [{ type: "text", text: "User input unavailable outside interactive mode." }], details: {} };
			}
			const answers: Record<string, string> = {};
			for (const question of params.questions) {
				const choices = question.options.map((option) => `${option.label} — ${option.description}`);
				const choice = await ctx.ui.select(`${question.header}\n${question.question}`, [...choices, "Other"]);
				if (!choice) return { content: [{ type: "text", text: "The user cancelled the questions." }], details: { answers } };
				if (choice === "Other") {
					const custom = await ctx.ui.input(question.question);
					if (!custom?.trim()) return { content: [{ type: "text", text: "The user cancelled the questions." }], details: { answers } };
					answers[question.id] = custom.trim();
				} else {
					answers[question.id] = question.options[choices.indexOf(choice)]?.label ?? choice;
				}
			}
			return { content: [{ type: "text", text: JSON.stringify({ answers }) }], details: { answers } };
		},
	});

	pi.registerCommand("plan", {
		description: "Enter or leave Codex-style Plan mode",
		handler: async (args, ctx) => {
			const value = args.trim();
			if (value === "off") setEnabled(false, ctx);
			else if (!value || value === "on") setEnabled(value === "on" || !enabled, ctx);
			else {
				setEnabled(true, ctx);
				pi.sendUserMessage(value);
			}
		},
	});

	pi.on("session_start", (_event, ctx) => {
		const state = ctx.sessionManager.getEntries()
			.filter((entry) => entry.type === "custom" && entry.customType === STATE_TYPE)
			.pop() as { data?: PlanState } | undefined;
		toolsBeforePlanMode = state?.data?.toolsBeforePlanMode;
		enabled = state?.data?.enabled ?? false;
		if (pi.getFlag("plan") === true) enabled = true;
		if (enabled) {
			const original = toolsBeforePlanMode ?? pi.getActiveTools().filter((name) => name !== QUESTION_TOOL);
			toolsBeforePlanMode = original;
			pi.setActiveTools([...original.filter((name) => !WRITE_TOOLS.has(name)), QUESTION_TOOL]);
		} else {
			pi.setActiveTools(pi.getActiveTools().filter((name) => name !== QUESTION_TOOL));
		}
		setStatus(ctx);
	});

	pi.on("before_agent_start", (event) => {
		if (enabled) return { systemPrompt: `${event.systemPrompt}\n\n${PLAN_MODE_PROMPT}` };
	});

	pi.on("tool_call", (event) => {
		if (!enabled) {
			if (event.toolName === QUESTION_TOOL) return { block: true, reason: "request_user_input is available only in Plan mode." };
			return;
		}
		if (WRITE_TOOLS.has(event.toolName)) {
			return { block: true, reason: `Plan mode blocks the ${event.toolName} tool. Use /plan off to leave Plan mode.` };
		}
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!enabled || !ctx.hasUI || !extractProposedPlan(lastAssistantText(event.messages))) return;
		const choice = await ctx.ui.select("Implement this plan?", [
			"Yes, implement this plan",
			"No, stay in Plan mode",
		]);
		if (choice !== "Yes, implement this plan") return;
		setEnabled(false, ctx);
		pi.sendUserMessage("Implement the plan.");
	});
}
