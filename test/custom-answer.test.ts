import assert from "node:assert/strict";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";
import { initTheme, type ExtensionContext, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable } from "@earendil-works/pi-tui";
import { inputCustomAnswer } from "../src/custom-answer.ts";

initTheme("dark");

test("custom input renders the return hint and handles submission, Escape, and abort", async () => {
  for (const action of ["submit", "empty submit", "escape", "abort", "already aborted"]) {
    const controller = new AbortController();
    if (action === "already aborted") controller.abort();
    let component!: Component & Focusable & { dispose(): void };
    const ctx = {
      mode: "tui",
      ui: {
        custom(factory: Parameters<ExtensionUIContext["custom"]>[0]) {
          return new Promise(resolve => {
            const created = factory({} as never, { fg: (_color: string, text: string) => text } as never, {
              matches: (data: string, key: string) => data === (key === "tui.select.confirm" ? "\r" : "\u001b"),
            } as never, resolve);
            component = created as typeof component;
          });
        },
      },
    } as unknown as ExtensionContext;
    const result = inputCustomAnswer(ctx, "2/3: Custom answer?", controller.signal);
    const rendered = component.render(80).map(stripVTControlCharacters).join("\n");
    assert.match(rendered, /2\/3: Custom answer\?/);
    assert.match(rendered, /enter submit.*escape\/ctrl\+c return to selection menu/);
    assert.doesNotMatch(rendered, /cancel/);
    component.focused = true;
    assert.equal(component.focused, true);
    if (action !== "empty submit") component.handleInput?.("hello");
    if (action === "submit" || action === "empty submit") component.handleInput?.("\r");
    if (action === "escape") component.handleInput?.("\u001b");
    if (action === "abort") controller.abort();
    assert.equal(await result, action === "submit" ? "hello" : action === "empty submit" ? "" : undefined);
    component.dispose();
  }
});
