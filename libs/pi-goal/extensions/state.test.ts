import assert from "node:assert/strict";
import test from "node:test";
import { createGoal, formatGoal, GOAL_ENTRY, restoreGoal, updateGoal } from "./state.ts";

test("creates a trimmed active goal", () => {
	assert.equal(GOAL_ENTRY, "pi-goal");
	assert.deepEqual(createGoal("  Ship it  ", 10), {
		objective: "Ship it",
		status: "active",
		createdAt: 10,
		updatedAt: 10,
	});
});

test("updates status and preserves the latest meaningful checkpoint", () => {
	const started = createGoal("Ship it", 1);
	const paused = updateGoal(started, "paused", "  Tests pass  ", 2);
	assert.deepEqual(paused, {
		objective: "Ship it",
		status: "paused",
		checkpoint: "Tests pass",
		blockedTurns: undefined,
		createdAt: 1,
		updatedAt: 2,
	});
	assert.equal(updateGoal(paused, "active", "", 3).checkpoint, "Tests pass");
	assert.equal(updateGoal(paused, "complete", undefined, 4).checkpoint, "Tests pass");
});

test("requires a blocker to recur across three turns and resets the count", () => {
	const first = updateGoal(createGoal("Ship it", 1), "blocked", "Waiting for access", 2);
	const second = updateGoal(first, "blocked", "Still waiting for access", 3);
	const third = updateGoal(second, "blocked", "Access is still unavailable", 4);

	assert.equal(first.status, "active");
	assert.equal(first.blockedTurns, 1);
	assert.equal(second.status, "active");
	assert.equal(second.blockedTurns, 2);
	assert.equal(third.status, "blocked");
	assert.equal(third.blockedTurns, 3);
	const reset = updateGoal(second, "active", "Found another path", 5);
	assert.equal(reset.blockedTurns, undefined);
	assert.equal(reset.status, "active");
});

test("restores the latest persisted goal state", () => {
	const first = createGoal("Ship it", 1);
	const paused = updateGoal(first, "paused", "Tests pass", 2);
	const impostor = createGoal("Wrong goal", 3);
	const restored = restoreGoal([
		{ type: "custom", customType: GOAL_ENTRY, data: first },
		{ type: "custom", customType: GOAL_ENTRY, data: paused },
		{ type: "message", customType: GOAL_ENTRY, data: impostor },
		{ type: "custom", customType: "other", data: impostor },
		{ type: "message" },
	]);

	assert.deepEqual(restored, paused);
	assert.deepEqual(restoreGoal([{ type: "custom", customType: GOAL_ENTRY, data: first }]), first);
});

test("restores an absent or cleared goal as absent", () => {
	assert.equal(restoreGoal([]), undefined);
	assert.equal(
		restoreGoal([
			{ type: "custom", customType: GOAL_ENTRY, data: createGoal("Ship it", 1) },
			{ type: "custom", customType: GOAL_ENTRY, data: null },
		]),
		undefined,
	);
});

test("formats goals with only available fields", () => {
	const goal = createGoal("Ship it", 1);
	assert.equal(formatGoal(goal), "Goal: Ship it\nStatus: active");
	assert.equal(
		formatGoal(updateGoal(goal, "complete", "Released", 2)),
		"Goal: Ship it\nStatus: complete\nCheckpoint: Released",
	);
});
