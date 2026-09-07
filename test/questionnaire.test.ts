import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";
import {
  initTheme, type ExtensionAPI, type ExtensionContext, type ExtensionUIContext,
  type KeybindingsManager, type Theme, type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, getKeybindings, type Component, type Focusable, type TUI } from "@earendil-works/pi-tui";
import extension from "../index.ts";

initTheme("dark");
const text = { id: "text", question: "Your name?" };
const choice = { id: "choice", question: "Pick one", options: [
  { label: "A", description: "First choice" }, { label: "B" },
] };
const down = "\u001b[B";
const enter = "\r";
const escape = "\u001b";

function setup(questions = [text, choice], signal?: AbortSignal, onRender?: () => void) {
  let tool!: ToolDefinition;
  let component!: Component & Focusable & { dispose(): void };
  let mounts = 0;
  let completions = 0;
  let renders = 0;
  extension({ registerTool: (value: ToolDefinition) => { tool = value; } } as ExtensionAPI);
  const ctx = {
    hasUI: true,
    mode: "tui",
    ui: {
      input: () => assert.fail("Persistent TUI must not open a separate input dialog"),
      select: () => assert.fail("Persistent TUI must not open a separate selection dialog"),
      custom(factory: Parameters<ExtensionUIContext["custom"]>[0]) {
        mounts++;
        return new Promise(resolve => {
          component = factory({ requestRender: () => { renders++; onRender?.(); } } as unknown as TUI,
            { fg: (color: string, value: string) => color === "dim" ? `\u001b[90m${value}\u001b[39m` : color === "border" ? `\u001b[34m${value}\u001b[39m` : value } as Theme,
            getKeybindings() as KeybindingsManager,
            value => { completions++; resolve(value); }) as typeof component;
        });
      },
    },
  } as unknown as ExtensionContext;
  const result = tool.execute("test", { questions }, signal, undefined, ctx);
  if (component) component.focused = true;
  return {
    result,
    get component() { return component; },
    get mounts() { return mounts; },
    get completions() { return completions; },
    get renders() { return renders; },
    press: (...keys: string[]) => keys.forEach(key => component.handleInput?.(key)),
    screen: (width = 80) => component.render(width).map(stripVTControlCharacters).join("\n"),
  };
}

test("questions support arbitrary order, editing, and explicit submission in one session", async () => {
  const env = setup([text, choice, { ...text, id: "last" }]);
  const mounted = env.component;
  assert.doesNotMatch(env.screen(), /Submit answers|Questions \(/);
  env.press("\t");
  assert.match(env.screen(), /2 \/ 3/);
  assert.ok(env.component.render(80).some(line => line.includes("\u001b[90m First choice")));
  env.press(down, enter, enter);
  assert.match(env.screen(), /Your name/);
  env.press("Ada", enter);
  assert.match(env.screen(), /Submit answers/);
  assert.equal(env.completions, 0);
  env.press("\t", "\t", "\t");
  assert.match(env.screen(), /Ada/);
  assert.ok(env.component.render(80).join("\n").includes(CURSOR_MARKER));
  env.press("\u0001", "\u000b", "Grace", enter, enter);
  const result = await env.result;
  assert.deepEqual(result.details, { answers: [
    { id: "text", answer: "Grace" }, { id: "choice", answer: "B" }, { id: "last", answer: "" },
  ], cancelled: false });
  assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify(result.details) }]);
  assert.equal(env.component, mounted);
  assert.equal(env.mounts, 1);
  env.press(enter, escape);
  assert.equal(env.completions, 1);
  env.component.dispose();
});

test("custom answers return to choices and count empty submissions as answered", async () => {
  for (const input of ["", "   "]) {
    const env = setup([choice, text]);
    env.press(down, down, enter);
    assert.match(env.screen(), /return to selection menu/);
    env.press(escape);
    assert.match(env.screen(), /→ Other Type your own answer/);
    env.press(enter, input, enter, input, enter);
    assert.match(env.screen(), /Submit answers/);
    env.press(enter);
    assert.deepEqual((await env.result).details, {
      answers: [{ id: "choice", answer: "" }, { id: "text", answer: "" }], cancelled: false,
    });
    env.component.dispose();
  }
});

test("Escape cancels from questions or submission and preserves completed answers", async () => {
  for (const second of [choice, { ...text, id: "second" }]) {
    for (const cancel of [escape, "\u0003"]) {
      const env = setup([text, second]);
      env.press("Ada", enter, cancel);
      assert.deepEqual((await env.result).details, {
        answers: [{ id: "text", answer: "Ada" }], cancelled: true,
      });
      env.component.dispose();
    }
  }
  const env = setup([text, { ...text, id: "second" }]);
  env.press(enter, enter, escape);
  assert.deepEqual((await env.result).details, {
    answers: [{ id: "text", answer: "" }, { id: "second", answer: "" }], cancelled: true,
  });
  env.component.dispose();
});

test("single questions keep their direct flow and custom-answer Escape behavior", async () => {
  const direct = setup([text]);
  assert.match(direct.screen(), /1\/1: Your name/);
  direct.press(enter);
  assert.deepEqual((await direct.result).details, { answers: [{ id: "text", answer: "" }], cancelled: false });
  direct.component.dispose();
  const env = setup([choice]);
  env.press(down, down, enter, escape, escape);
  assert.deepEqual((await env.result).details, { answers: [], cancelled: true });
  env.component.dispose();
});

test("abort closes once, preserves answers, and removes its listener", async () => {
  for (const custom of [false, true]) {
    const controller = new AbortController();
    const env = setup([text, choice], controller.signal);
    assert.equal(getEventListeners(controller.signal, "abort").length, 1);
    env.press("Ada", enter);
    if (custom) env.press(down, down, enter, "unfinished");
    controller.abort();
    env.press(enter);
    assert.deepEqual((await env.result).details, {
      answers: [{ id: "text", answer: "Ada" }], cancelled: true,
    });
    assert.equal(env.completions, 1);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    env.component.dispose();
  }
  const controller = new AbortController();
  controller.abort();
  const stopped = setup([text], controller.signal);
  assert.deepEqual((await stopped.result).details, { answers: [], cancelled: true });
  assert.equal(stopped.mounts, 0);
});

test("resize and focus continue working after Tab navigation", async () => {
  const env = setup([text, choice]);
  env.component.focused = false;
  env.press("\t", down, down, enter);
  assert.ok(!env.component.render(80).join("\n").includes(CURSOR_MARKER));
  env.component.focused = true;
  for (const width of [30, 100]) {
    env.component.invalidate();
    assert.match(env.screen(width), /Pick one/);
    assert.ok(env.component.render(width).join("\n").includes(CURSOR_MARKER));
  }
  env.press(escape, escape);
  await env.result;
  env.component.dispose();
});

test("abort during initial rendering closes the mounted session without accepting input", async () => {
  const controller = new AbortController();
  const env = setup([text], controller.signal, () => controller.abort());
  env.press("late", enter);
  assert.deepEqual((await env.result).details, { answers: [], cancelled: true });
  assert.equal(env.mounts, 1);
  assert.equal(env.completions, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  env.component.dispose();
});


test("Tab cycles questions, preserves drafts, and keeps the counter at the right edge", async () => {
  const env = setup([text, choice, { ...text, id: "last" }]);
  const mounted = env.component;
  assert.equal(env.screen().split("\n")[2], " " + "1 / 3".padStart(78) + " ");
  assert.ok(env.component.render(80)[2].startsWith("\u001b[34m"));
  assert.match(env.screen().split("\n")[0], /^─+$/);
  assert.match(env.screen().split("\n").at(-1)!, /^─+$/);
  env.press("draft", "\t");
  assert.match(env.screen(), /2 \/ 3/);
  assert.match(env.screen(), /Pick one/);
  env.press(down, down, enter, "custom draft", "\t");
  assert.match(env.screen(), /3 \/ 3/);
  env.press("\t");
  assert.match(env.screen(), /draft/);
  env.press("\t");
  assert.match(env.screen(), /custom draft/);
  assert.match(env.screen(), /return to selection menu/);
  for (const width of [3, 30, 100]) {
    assert.equal(env.screen(width).split("\n")[2].length, width);
  }
  assert.equal(env.component, mounted);
  assert.equal(env.mounts, 1);
  env.press(escape, escape);
  assert.deepEqual((await env.result).details, { answers: [], cancelled: true });
  env.component.dispose();
});


test("navigation stays inside input, choice, custom input, and submission frames", async () => {
  const env = setup();
  function check(hints: RegExp) {
    const lines = env.screen().split("\n");
    assert.match(lines[0], /^─+$/);
    assert.match(lines.at(-1)!, /^─+$/);
    const footer = lines.find(line => line.includes("tab cycle"));
    assert.ok(footer);
    assert.match(footer, hints);
    assert.ok(footer.startsWith(" "));
    assert.match(lines[2], /[12] \/ 2 $/);
    assert.ok(env.component.render(80)[2].startsWith("\u001b[34m"));
  }
  check(/enter submit.*cancel.*tab cycle/);
  env.press(enter);
  check(/navigate.*enter select.*cancel.*tab cycle/);
  env.press(down, down, enter);
  check(/enter submit.*return to selection menu.*tab cycle/);
  env.press(enter);
  check(/enter select.*cancel.*tab cycle/);
  env.press(enter);
  await env.result;
  env.component.dispose();
});
