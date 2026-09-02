import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import goalMode from "./index.ts";

test("starts and completes a goal through Pi's command and tool APIs", async () => {
	const entries: unknown[] = [];
	const commands = new Map<string, { handler: (args: string, ctx: ExtensionContext) => Promise<void> }>();
	let tool: Parameters<ExtensionAPI["registerTool"]>[0] | undefined;
	const pi = {
		appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
		on: () => {},
		registerCommand: (name: string, command: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) =>
			commands.set(name, command),
		registerTool: (registered: Parameters<ExtensionAPI["registerTool"]>[0]) => {
			tool = registered;
		},
		sendMessage: () => {},
	} as unknown as ExtensionAPI;
	const ctx = {
		ui: { notify: () => {}, setStatus: () => {} },
	} as unknown as ExtensionContext;

	goalMode(pi);
	await commands.get("goal")?.handler("Ship it", ctx);
	assert.equal(entries.length, 1);

	await tool?.execute("call", { status: "complete", checkpoint: "All checks pass" }, new AbortController().signal, undefined, ctx);
	assert.equal((entries.at(-1) as { data: { status: string } }).data.status, "complete");
});
