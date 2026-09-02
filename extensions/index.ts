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

	pi.registerCommand("goal", {
		description: "Start, inspect, pause, resume, or clear a goal",
		handler: async (args, ctx) => {
			const input = args.trim();

			if (!input) {
				ctx.ui.notify(goal ? formatGoal(goal) : "No goal is set.", "info");
				return;
			}

			if (input === "clear") {
				setGoal(undefined, ctx);
				ctx.ui.notify("Goal cleared.", "info");
				return;
			}

			if (input === "pause") {
				if (!goal || goal.status !== "active") {
					ctx.ui.notify("There is no active goal to pause.", "warning");
					return;
				}
				setGoal(updateGoal(goal, "paused"), ctx);
				ctx.ui.notify("Goal paused.", "info");
				return;
			}

			if (input === "resume") {
				if (!goal || (goal.status !== "paused" && goal.status !== "blocked")) {
					ctx.ui.notify("There is no paused or blocked goal to resume.", "warning");
					return;
				}
				setGoal(updateGoal(goal, "active"), ctx);
				ctx.ui.notify("Goal resumed.", "info");
				pi.sendMessage(
					{ customType: "goal-resume", content: "Continue working toward the active goal.", display: false },
					{ triggerTurn: true },
				);
				return;
			}

			if (goal?.status === "active" || goal?.status === "paused") {
				ctx.ui.notify("Finish or clear the current goal before starting another.", "warning");
				return;
			}

			setGoal(createGoal(input), ctx);
			pi.sendMessage(
				{ customType: "goal-start", content: "Start working toward the active goal.", display: false },
				{ triggerTurn: true },
			);
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

			setGoal(updateGoal(goal, params.status, params.checkpoint), ctx);
			return { content: [{ type: "text", text: formatGoal(goal) }], details: { goal } };
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
Keep working independently toward this one objective across turns. Make scoped progress and verify it with relevant commands or artifacts. Use update_goal with status active after a meaningful checkpoint. Use complete only when the objective is fully achieved and verified. Use blocked only when progress genuinely requires user input or an external state change. Do not stop because the work is difficult or incomplete.`,
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
