import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createGoal, formatGoal, GOAL_ENTRY, type GoalState, restoreGoal, updateGoal } from "./state.ts";

const GoalUpdate = Type.Object({
	status: Type.Union([Type.Literal("active"), Type.Literal("complete"), Type.Literal("blocked")]),
	checkpoint: Type.String({ description: "A concise, evidence-based progress or outcome summary" }),
});

export default function goalMode(pi: ExtensionAPI): void {
	let goal: GoalState | undefined;

	function persist(): void {
		pi.appendEntry<GoalState | null>(GOAL_ENTRY, goal ?? null);
	}

	function updateStatus(ctx: ExtensionContext): void {
		ctx.ui.setStatus(GOAL_ENTRY, goal ? `goal: ${goal.status}` : undefined);
	}

	function setGoal(next: GoalState | undefined, ctx: ExtensionContext): void {
		goal = next;
		persist();
		updateStatus(ctx);
	}

	function showGoal(ctx: ExtensionContext): void {
		ctx.ui.notify(goal ? formatGoal(goal) : "No goal is set.", "info");
	}

	function clearGoal(ctx: ExtensionContext): void {
		setGoal(undefined, ctx);
		ctx.ui.notify("Goal cleared.", "info");
	}

	function pauseGoal(ctx: ExtensionContext): void {
		if (!goal || goal.status !== "active") {
			ctx.ui.notify("There is no active goal to pause.", "warning");
			return;
		}
		setGoal(updateGoal(goal, "paused"), ctx);
		ctx.ui.notify("Goal paused.", "info");
	}

	function resumeGoal(ctx: ExtensionContext): void {
		if (!goal || !["paused", "blocked"].includes(goal.status)) {
			ctx.ui.notify("There is no paused or blocked goal to resume.", "warning");
			return;
		}
		setGoal(updateGoal(goal, "active"), ctx);
		ctx.ui.notify("Goal resumed.", "info");
		pi.sendMessage(
			{ customType: "goal-resume", content: "Continue working toward the active goal.", display: false },
			{ triggerTurn: true },
		);
	}

	function startGoal(objective: string, ctx: ExtensionContext): void {
		if (goal && ["active", "paused"].includes(goal.status)) {
			ctx.ui.notify("Finish or clear the current goal before starting another.", "warning");
			return;
		}
		setGoal(createGoal(objective), ctx);
		pi.sendMessage(
			{ customType: "goal-start", content: "Start working toward the active goal.", display: false },
			{ triggerTurn: true },
		);
	}

	const controls = new Map<string, (ctx: ExtensionContext) => void>([
		["clear", clearGoal],
		["pause", pauseGoal],
		["resume", resumeGoal],
	]);

	pi.registerCommand("goal", {
		description: "Start, inspect, pause, resume, or clear a goal",
		handler: async (args, ctx) => {
			const input = args.trim();

			if (!input) return showGoal(ctx);
			const control = controls.get(input);
			if (control) return control(ctx);
			startGoal(input, ctx);
		},
	});

	pi.registerTool({
		name: "update_goal",
		label: "Update Goal",
		description: "Record verified goal progress, completion, or a genuine blocker.",
		parameters: GoalUpdate,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!goal) {
				return { content: [{ type: "text", text: "No goal is set." }], details: {} };
			}
			if (goal.status === "paused") {
				return { content: [{ type: "text", text: "The goal is paused." }], details: { goal } };
			}

			const next = updateGoal(goal, params.status, params.checkpoint);
			setGoal(next, ctx);
			const text =
				params.status === "blocked" && next.status === "active"
					? `Blocker recorded (${next.blockedTurns}/3). Keep trying safe alternatives.`
					: formatGoal(next);
			return { content: [{ type: "text", text }], details: { goal: next } };
		},
	});

	pi.on("before_agent_start", () => {
		if (goal?.status !== "active") return;

		return {
			message: {
				customType: "goal-context",
				content: `[GOAL MODE ACTIVE]

Objective: ${goal.objective}
${goal.checkpoint ? `Latest checkpoint: ${goal.checkpoint}\n` : ""}
Keep working independently toward this one objective across turns. Make scoped progress and verify it with relevant commands or artifacts. Use update_goal with status active after a meaningful checkpoint. Use complete only when the objective is fully achieved and verified. Report blocked only when the same genuine blocker prevents progress for three consecutive turns; earlier blocked reports keep the goal active so you can exhaust safe alternatives. Do not stop because the work is difficult or incomplete.`,
				display: false,
			},
		};
	});

	pi.on("agent_settled", (_event, ctx) => {
		if (goal?.status !== "active" || !ctx.isIdle() || ctx.hasPendingMessages()) return;

		pi.sendMessage(
			{
				customType: "goal-continuation",
				content: "Continue working toward the active goal from the latest verified checkpoint.",
				display: false,
			},
			{ triggerTurn: true, deliverAs: "nextTurn" },
		);
	});

	pi.on("session_start", (_event, ctx) => {
		goal = restoreGoal(ctx.sessionManager.getBranch());
		updateStatus(ctx);
	});

	pi.on("session_tree", (_event, ctx) => {
		goal = restoreGoal(ctx.sessionManager.getBranch());
		updateStatus(ctx);
	});
}
