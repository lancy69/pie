export const GOAL_ENTRY = "pi-goal";

export type GoalStatus = "active" | "paused" | "complete" | "blocked";

export interface GoalState {
	objective: string;
	status: GoalStatus;
	checkpoint?: string;
	createdAt: number;
	updatedAt: number;
}

export function createGoal(objective: string, now = Date.now()): GoalState {
	return { objective: objective.trim(), status: "active", createdAt: now, updatedAt: now };
}

export function updateGoal(
	goal: GoalState,
	status: GoalStatus,
	checkpoint?: string,
	now = Date.now(),
): GoalState {
	return { ...goal, status, checkpoint: checkpoint?.trim() || goal.checkpoint, updatedAt: now };
}

export function restoreGoal(entries: readonly unknown[]): GoalState | undefined {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index] as { type?: string; customType?: string; data?: GoalState | null };
		if (entry.type === "custom" && entry.customType === GOAL_ENTRY) return entry.data ?? undefined;
	}
}

export function formatGoal(goal: GoalState): string {
	return [
		`Goal: ${goal.objective}`,
		`Status: ${goal.status}`,
		goal.checkpoint && `Checkpoint: ${goal.checkpoint}`,
	]
		.filter(Boolean)
		.join("\n");
}
