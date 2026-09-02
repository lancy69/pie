import assert from "node:assert/strict";
import test from "node:test";
import { createGoal, GOAL_ENTRY, restoreGoal, updateGoal } from "./state.ts";

test("restores the latest persisted goal state", () => {
	const first = createGoal("Ship it", 1);
	const paused = updateGoal(first, "paused", "Tests pass", 2);
	const restored = restoreGoal([
		{ type: "custom", customType: GOAL_ENTRY, data: first },
		{ type: "message" },
		{ type: "custom", customType: GOAL_ENTRY, data: paused },
	]);

	assert.deepEqual(restored, paused);
});

test("a cleared goal restores as absent", () => {
	assert.equal(
		restoreGoal([
			{ type: "custom", customType: GOAL_ENTRY, data: createGoal("Ship it", 1) },
			{ type: "custom", customType: GOAL_ENTRY, data: null },
		]),
		undefined,
	);
});
