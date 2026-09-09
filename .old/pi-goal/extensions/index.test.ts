import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import goalMode from "./index.ts";
import { createGoal, GOAL_ENTRY } from "./state.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
type Tool = Parameters<ExtensionAPI["registerTool"]>[0];

function harness(branch: unknown[] = []) {
	const commands = new Map<string, { description?: string; handler: (args: string, ctx: ExtensionContext) => Promise<void> }>();
	const handlers = new Map<string, Handler>();
	const entries: Array<{ type: string; customType: string; data: unknown }> = [];
	const messages: Array<{ message: Record<string, unknown>; options?: Record<string, unknown> }> = [];
	const notifications: Array<[string, string | undefined]> = [];
	const statuses: Array<[string, string | undefined]> = [];
	let idle = true;
	let pending = false;
	let currentBranch = branch;
	let tool: Tool | undefined;

	const pi = {
		appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
		on: (event: string, handler: Handler) => handlers.set(event, handler),
		registerCommand: (name: string, command: { description?: string; handler: (args: string, ctx: ExtensionContext) => Promise<void> }) =>
			commands.set(name, command),
		registerTool: (registered: Tool) => {
			tool = registered;
		},
		sendMessage: (message: Record<string, unknown>, options?: Record<string, unknown>) =>
			messages.push({ message, options }),
	} as unknown as ExtensionAPI;

	const ctx = {
		hasPendingMessages: () => pending,
		isIdle: () => idle,
		sessionManager: { getBranch: () => currentBranch },
		ui: {
			notify: (message: string, level?: string) => notifications.push([message, level]),
			setStatus: (key: string, value?: string) => statuses.push([key, value]),
		},
	} as unknown as ExtensionContext;

	goalMode(pi);
	assert.ok(tool);
	const command = commands.get("goal");
	assert.ok(command);

	return {
		command,
		ctx,
		entries,
		handlers,
		messages,
		notifications,
		statuses,
		tool,
		setBranch: (next: unknown[]) => {
			currentBranch = next;
		},
		setIdle: (next: boolean) => {
			idle = next;
		},
		setPending: (next: boolean) => {
			pending = next;
		},
	};
}

async function execute(h: ReturnType<typeof harness>, status: "active" | "complete" | "blocked", checkpoint: string) {
	return h.tool.execute("call", { status, checkpoint }, new AbortController().signal, undefined, h.ctx);
}

function resultText(result: Awaited<ReturnType<Tool["execute"]>>): string {
	const content = result.content[0];
	assert.equal(content?.type, "text");
	return content?.type === "text" ? content.text : "";
}

test("registers the command, tool, schema, and lifecycle handlers", () => {
	const h = harness();

	assert.equal(h.command.description, "Start, inspect, pause, resume, or clear a goal");
	assert.equal(h.tool.name, "update_goal");
	assert.equal(h.tool.label, "Update Goal");
	assert.equal(h.tool.description, "Record verified goal progress, completion, or a genuine blocker.");
	assert.deepEqual(JSON.parse(JSON.stringify(h.tool.parameters)), {
		type: "object",
		properties: {
			status: { anyOf: [{ const: "active", type: "string" }, { const: "complete", type: "string" }, { const: "blocked", type: "string" }] },
			checkpoint: { type: "string", description: "A concise, evidence-based progress or outcome summary" },
		},
		required: ["status", "checkpoint"],
	});
	assert.deepEqual([...h.handlers.keys()], ["before_agent_start", "agent_settled", "session_start", "session_tree"]);
});

test("starts, reports, and protects an unfinished goal", async () => {
	const h = harness();
	await h.command.handler("  Ship it  ", h.ctx);

	const started = h.entries[0]?.data as { objective: string; status: string; createdAt: number; updatedAt: number };
	assert.equal(started.objective, "Ship it");
	assert.equal(started.status, "active");
	assert.equal(started.createdAt, started.updatedAt);
	assert.deepEqual(h.statuses, [[GOAL_ENTRY, "goal: active"]]);
	assert.deepEqual(h.messages, [{
		message: { customType: "goal-start", content: "Start working toward the active goal.", display: false },
		options: { triggerTurn: true },
	}]);

	await h.command.handler("", h.ctx);
	assert.deepEqual(h.notifications.at(-1), ["Goal: Ship it\nStatus: active", "info"]);

	await h.command.handler("Replace it", h.ctx);
	assert.deepEqual(h.notifications.at(-1), ["Finish or clear the current goal before starting another.", "warning"]);
	assert.equal(h.entries.length, 1);
	assert.equal(h.messages.length, 1);
});

test("validates pause, resume, and clear controls", async () => {
	const h = harness();

	await h.command.handler("  pause  ", h.ctx);
	await h.command.handler("resume", h.ctx);
	assert.deepEqual(h.notifications, [
		["There is no active goal to pause.", "warning"],
		["There is no paused or blocked goal to resume.", "warning"],
	]);

	await h.command.handler("Ship it", h.ctx);
	await h.command.handler("pause", h.ctx);
	assert.equal((h.entries.at(-1)?.data as { status: string }).status, "paused");
	assert.deepEqual(h.notifications.at(-1), ["Goal paused.", "info"]);
	await h.command.handler("pause", h.ctx);
	assert.deepEqual(h.notifications.at(-1), ["There is no active goal to pause.", "warning"]);
	await h.command.handler("Another", h.ctx);
	assert.deepEqual(h.notifications.at(-1), ["Finish or clear the current goal before starting another.", "warning"]);

	h.messages.length = 0;
	await h.command.handler("resume", h.ctx);
	assert.equal((h.entries.at(-1)?.data as { status: string }).status, "active");
	assert.deepEqual(h.notifications.at(-1), ["Goal resumed.", "info"]);
	assert.deepEqual(h.messages, [{
		message: { customType: "goal-resume", content: "Continue working toward the active goal.", display: false },
		options: { triggerTurn: true },
	}]);

	await h.command.handler("clear", h.ctx);
	assert.equal(h.entries.at(-1)?.data, null);
	assert.deepEqual(h.statuses.at(-1), [GOAL_ENTRY, undefined]);
	assert.deepEqual(h.notifications.at(-1), ["Goal cleared.", "info"]);
	await h.command.handler("", h.ctx);
	assert.deepEqual(h.notifications.at(-1), ["No goal is set.", "info"]);
});

test("rejects tool updates without an available goal", async () => {
	const h = harness();
	const absent = await execute(h, "active", "Progress");
	assert.equal(resultText(absent), "No goal is set.");
	assert.deepEqual(absent.details, {});

	await h.command.handler("Ship it", h.ctx);
	await h.command.handler("pause", h.ctx);
	const paused = await execute(h, "active", "Progress");
	assert.equal(resultText(paused), "The goal is paused.");
	assert.equal((paused.details as { goal: { status: string } }).goal.status, "paused");
});

test("records checkpoints, recurring blockers, resumes, and completion", async () => {
	const h = harness();
	await h.command.handler("Ship it", h.ctx);

	const progress = await execute(h, "active", "  Tests pass  ");
	assert.equal(resultText(progress), "Goal: Ship it\nStatus: active\nCheckpoint: Tests pass");
	assert.equal((progress.details as { goal: { checkpoint: string } }).goal.checkpoint, "Tests pass");

	const first = await execute(h, "blocked", "Waiting for access");
	assert.equal(resultText(first), "Blocker recorded (1/3). Keep trying safe alternatives.");
	const reset = await execute(h, "active", "Found another path");
	assert.equal(resultText(reset), "Goal: Ship it\nStatus: active\nCheckpoint: Found another path");
	assert.equal((reset.details as { goal: { blockedTurns?: number } }).goal.blockedTurns, undefined);

	assert.equal(resultText(await execute(h, "blocked", "Waiting again")), "Blocker recorded (1/3). Keep trying safe alternatives.");
	assert.equal(resultText(await execute(h, "blocked", "Still waiting")), "Blocker recorded (2/3). Keep trying safe alternatives.");
	const blocked = await execute(h, "blocked", "Access is unavailable");
	assert.equal(resultText(blocked), "Goal: Ship it\nStatus: blocked\nCheckpoint: Access is unavailable");
	assert.equal((blocked.details as { goal: { blockedTurns: number } }).goal.blockedTurns, 3);

	await h.command.handler("resume", h.ctx);
	assert.equal((h.entries.at(-1)?.data as { status: string; blockedTurns?: number }).status, "active");
	assert.equal((h.entries.at(-1)?.data as { blockedTurns?: number }).blockedTurns, undefined);

	const complete = await execute(h, "complete", "Released");
	assert.equal(resultText(complete), "Goal: Ship it\nStatus: complete\nCheckpoint: Released");
	await h.command.handler("Next goal", h.ctx);
	assert.equal((h.entries.at(-1)?.data as { objective: string }).objective, "Next goal");
});

test("restores sessions and injects exact active-goal context", () => {
	const restored = { ...createGoal("Ship it", 1), checkpoint: "Tests pass", updatedAt: 2 };
	const h = harness([{ type: "custom", customType: GOAL_ENTRY, data: restored }]);

	h.handlers.get("session_start")?.({}, h.ctx);
	assert.deepEqual(h.statuses, [[GOAL_ENTRY, "goal: active"]]);
	assert.deepEqual(h.handlers.get("before_agent_start")?.({}, h.ctx), {
		message: {
			customType: "goal-context",
			content: `[GOAL MODE ACTIVE]\n\nObjective: Ship it\nLatest checkpoint: Tests pass\n\nKeep working independently toward this one objective across turns. Make scoped progress and verify it with relevant commands or artifacts. Use update_goal with status active after a meaningful checkpoint. Use complete only when the objective is fully achieved and verified. Report blocked only when the same genuine blocker prevents progress for three consecutive turns; earlier blocked reports keep the goal active so you can exhaust safe alternatives. Do not stop because the work is difficult or incomplete.`,
			display: false,
		},
	});

	h.setBranch([{ type: "custom", customType: GOAL_ENTRY, data: null }]);
	h.handlers.get("session_tree")?.({}, h.ctx);
	assert.deepEqual(h.statuses.at(-1), [GOAL_ENTRY, undefined]);
	assert.equal(h.handlers.get("before_agent_start")?.({}, h.ctx), undefined);
});

test("injects context without an absent checkpoint line", () => {
	const h = harness([{ type: "custom", customType: GOAL_ENTRY, data: createGoal("Ship it", 1) }]);
	h.handlers.get("session_start")?.({}, h.ctx);
	const event = h.handlers.get("before_agent_start")?.({}, h.ctx) as { message: { content: string } };
	assert.equal(
		event.message.content,
		`[GOAL MODE ACTIVE]\n\nObjective: Ship it\n\nKeep working independently toward this one objective across turns. Make scoped progress and verify it with relevant commands or artifacts. Use update_goal with status active after a meaningful checkpoint. Use complete only when the objective is fully achieved and verified. Report blocked only when the same genuine blocker prevents progress for three consecutive turns; earlier blocked reports keep the goal active so you can exhaust safe alternatives. Do not stop because the work is difficult or incomplete.`,
	);
});

test("continues only an idle active goal", async () => {
	const h = harness();
	await h.command.handler("Ship it", h.ctx);
	h.messages.length = 0;

	h.handlers.get("agent_settled")?.({}, h.ctx);
	assert.deepEqual(h.messages, [{
		message: {
			customType: "goal-continuation",
			content: "Continue working toward the active goal from the latest verified checkpoint.",
			display: false,
		},
		options: { triggerTurn: true, deliverAs: "nextTurn" },
	}]);

	h.setIdle(false);
	h.handlers.get("agent_settled")?.({}, h.ctx);
	h.setIdle(true);
	h.setPending(true);
	h.handlers.get("agent_settled")?.({}, h.ctx);
	assert.equal(h.messages.length, 1);

	h.setPending(false);
	await execute(h, "complete", "Done");
	h.handlers.get("agent_settled")?.({}, h.ctx);
	assert.equal(h.messages.length, 1);
});

test("does not continue when no goal is set", () => {
	const h = harness();
	h.handlers.get("agent_settled")?.({}, h.ctx);
	assert.deepEqual(h.messages, []);
});
