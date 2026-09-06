import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import extension from "../src/index.ts";

type Question = { id: string; question: string; options?: { label: string; description?: string }[] };
const name: Question = { id: "name", question: "Your name?" };
const pick: Question = { id: "pick", question: "Pick one", options: [{ label: " A " }, { label: "B" }] };

function setup({ inputs = [], selections = [], hasUI = true, onDialog }: {
  inputs?: (string | undefined)[];
  selections?: (string | undefined)[];
  hasUI?: boolean;
  onDialog?: () => void;
} = {}) {
  inputs = [...inputs];
  selections = [...selections];
  let tool!: ToolDefinition;
  extension({ registerTool: (value: ToolDefinition) => { tool = value; } } as ExtensionAPI);
  const calls: { kind: string; title: string; options?: string[]; signal?: AbortSignal }[] = [];
  const ctx = {
    hasUI,
    ui: {
      async select(title: string, options: string[], opts?: { signal?: AbortSignal }) {
        calls.push({ kind: "select", title, options, signal: opts?.signal });
        onDialog?.();
        return selections.shift();
      },
      async input(title: string, _placeholder?: string, opts?: { signal?: AbortSignal }) {
        calls.push({ kind: "input", title, signal: opts?.signal });
        onDialog?.();
        return inputs.shift();
      },
    },
  } as unknown as ExtensionContext;
  return { tool, calls, run: (questions: Question[] = [name], signal?: AbortSignal) =>
    tool.execute("test", { questions }, signal, undefined, ctx) };
}

test("registers the final sequential tool and validates its parameter shape", () => {
  const { tool } = setup();
  assert.equal(tool.name, "ask_questions");
  assert.equal(tool.executionMode, "sequential");
  assert.equal(Value.Check(tool.parameters, { questions: [name, pick] }), true);
  for (const params of [{}, { question: "old interface" }, { questions: [] },
    { questions: [{ question: "Missing ID" }] }, { questions: [{ ...name, options: [123] }] },
    { questions: [{ ...name, options: ["old string"] }] },
    { questions: [{ ...name, options: [{ label: "A", description: 123 }] }] }]) {
    assert.equal(Value.Check(tool.parameters, params), false);
  }
});

test("trims text and retries blanks with the same progress title", async () => {
  const env = setup({ inputs: ["  ", "  Ada  "] });
  const result = await env.run();
  assert.deepEqual(result.details, { answers: [{ id: "name", answer: "Ada" }], cancelled: false });
  assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify(result.details) }]);
  assert.deepEqual(env.calls.map(c => c.title), ["1/1: Your name?", "1/1: Your name?"]);
});

test("sequences choices, Other, and text with mapped IDs and progress", async () => {
  const controller = new AbortController();
  const env = setup({ selections: ["B", "Other"], inputs: [" C ", "Ada"] });
  const result = await env.run([pick, { ...pick, id: "custom" }, { ...name, options: [] }], controller.signal);
  assert.deepEqual(result.details, {
    answers: [{ id: "pick", answer: "B" }, { id: "custom", answer: "C" }, { id: "name", answer: "Ada" }],
    cancelled: false,
  });
  assert.deepEqual(env.calls.map(({ kind, title }) => [kind, title]), [
    ["select", "1/3: Pick one"], ["select", "2/3: Pick one"], ["input", "2/3: Pick one"], ["input", "3/3: Your name?"],
  ]);
  assert.deepEqual(env.calls[0].options, ["A", "B", "Other"]);
  assert.ok(env.calls.every(call => call.signal === controller.signal));
});

test("validates every question before prompting", async () => {
  const invalid: Question[][] = [[], [name, { ...name }], [{ ...name, id: " " }],
    [name, { ...name, id: " name " }], [{ ...name, question: " \n " }]];
  for (const options of [[" "], ["A", " A "], ["Other"], [" Other "]]) {
    invalid.push([name, { ...pick, options: options.map(label => ({ label })) }]);
  }
  for (const questions of invalid) {
    const env = setup();
    await assert.rejects(env.run(questions), /required|nonblank|must not be blank|Options must/);
    assert.equal(env.calls.length, 0);
  }
  const headless = setup({ hasUI: false });
  await assert.rejects(headless.run(), /interactive UI/);
  assert.equal(headless.calls.length, 0);
});

test("Escape preserves completed answers and stops the questionnaire", async () => {
  for (const selections of [[undefined], ["Other"]]) {
    const env = setup({ inputs: ["Ada", undefined], selections });
    assert.deepEqual((await env.run([name, pick, { ...name, id: "later" }])).details, {
      answers: [{ id: "name", answer: "Ada" }], cancelled: true,
    });
    assert.equal(env.calls.length, selections[0] === "Other" ? 3 : 2);
  }
  assert.deepEqual((await setup().run()).details, { answers: [], cancelled: true });
});

test("abort preserves prior answers, dismisses dialogs, and prevents later prompts", async () => {
  for (const second of [name, pick]) {
    const controller = new AbortController();
    let count = 0;
    const env = setup({ inputs: ["Ada", "late"], selections: ["B"],
      onDialog: () => { if (++count === 2) controller.abort(); } });
    assert.deepEqual((await env.run([name, { ...second, id: "second" }, pick], controller.signal)).details, {
      answers: [{ id: "name", answer: "Ada" }], cancelled: true,
    });
    assert.equal(env.calls.length, 2);
    assert.ok(env.calls.every(call => call.signal === controller.signal));
    const stopped = setup();
    assert.deepEqual((await stopped.run([name], controller.signal)).details, { answers: [], cancelled: true });
    assert.equal(stopped.calls.length, 0);
  }
});


test("displays optional descriptions but returns only the selected label", async () => {
  const described: Question = { ...pick, options: [
    { label: " TypeScript ", description: " Static types — editor support " },
    { label: "JavaScript" },
    { label: "Other language", description: "   " },
  ] };
  for (const [selection, answer] of [
    ["TypeScript — Static types — editor support", "TypeScript"],
    ["JavaScript", "JavaScript"], ["Other language", "Other language"], ["Other", "Rust"],
  ]) {
    const env = setup({ selections: [selection], inputs: ["Rust"] });
    assert.equal(Value.Check(env.tool.parameters, { questions: [described] }), true);
    assert.deepEqual((await env.run([described])).details, {
      answers: [{ id: "pick", answer }], cancelled: false,
    });
    assert.deepEqual(env.calls[0].options, [
      "TypeScript — Static types — editor support", "JavaScript", "Other language", "Other",
    ]);
    assert.equal(env.calls.length, selection === "Other" ? 2 : 1);
  }
});

test("rejects duplicate labels and ambiguous display text before prompting", async () => {
  for (const options of [
    [{ label: "A", description: "first" }, { label: "A", description: "second" }],
    [{ label: "A", description: "B" }, { label: "A — B" }],
  ]) {
    const env = setup();
    await assert.rejects(env.run([name, { ...pick, options }]), /Options must/);
    assert.equal(env.calls.length, 0);
  }
});
