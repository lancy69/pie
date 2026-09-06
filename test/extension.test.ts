import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import extension from "../src/index.ts";

function setup(inputs: (string | undefined)[] = [], hasUI = true, onInput?: () => void) {
  let tool!: ToolDefinition;
  extension({ registerTool: (value: ToolDefinition) => { tool = value; } } as ExtensionAPI);
  const calls: { title: string; signal?: AbortSignal }[] = [];
  const ctx = {
    hasUI,
    ui: {
      async input(title: string, _placeholder?: string, opts?: { signal?: AbortSignal }) {
        calls.push({ title, signal: opts?.signal });
        onInput?.();
        return inputs.shift();
      },
    },
  } as unknown as ExtensionContext;
  return { tool, calls, run: (params = { question: "Your name?" }, signal?: AbortSignal) =>
    tool.execute("test", params, signal, undefined, ctx) };
}

test("registers a sequential text question and retries blank answers", async () => {
  const env = setup(["  ", "  Ada  "]);
  assert.equal(env.tool.name, "ask_question");
  assert.equal(env.tool.executionMode, "sequential");
  const result = await env.run();
  assert.deepEqual(result.details, { answer: "Ada", cancelled: false });
  assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify(result.details) }]);
  assert.deepEqual(env.calls.map(c => c.title), ["Your name?", "Your name?"]);
});

test("Escape cancels and invalid questions or unavailable UI never prompt", async () => {
  assert.deepEqual((await setup().run()).details, { answer: null, cancelled: true });
  const blank = setup();
  await assert.rejects(blank.run({ question: " \n " }), /must not be blank/);
  assert.equal(blank.calls.length, 0);
  const headless = setup([], false);
  await assert.rejects(headless.run(), /interactive UI/);
  assert.equal(headless.calls.length, 0);
});

test("passes abort signals to dialogs and ignores answers after abort", async () => {
  const controller = new AbortController();
  const env = setup(["late answer"], true, () => controller.abort());
  assert.deepEqual((await env.run(undefined, controller.signal)).details, { answer: null, cancelled: true });
  assert.equal(env.calls[0].signal, controller.signal);
  const stopped = setup();
  await stopped.run(undefined, controller.signal);
  assert.equal(stopped.calls.length, 0);
});
