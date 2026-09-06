import {
  DynamicBorder, ExtensionSelectorComponent, keyHint,
  type ExtensionContext, type KeybindingsManager, type Theme,
} from "@earendil-works/pi-coding-agent";
import { Container, Input, Spacer, Text, type Component, type Focusable } from "@earendil-works/pi-tui";

import { displayChoice, otherOption, type Answer, type Question } from "./questions.ts";

type Page = Component & Partial<Focusable> & { dispose?(): void };

export async function askQuestionnaire(ctx: ExtensionContext, questions: Question[], signal?: AbortSignal): Promise<Answer[]> {
  const answers: Answer[] = [];
  if (signal?.aborted) return answers;

  return ctx.ui.custom<Answer[]>((tui, theme, keybindings, done) => {
    let page: Page;
    let focused = false;
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", finish);
      done(answers);
    }
    function show(next: Page) {
      if (page && "focused" in page) page.focused = false;
      page = next;
      if ("focused" in page) page.focused = focused;
      tui.requestRender();
    }
    function submit(answer: string) {
      answers.push({ id: questions[answers.length].id, answer: answer.trim() });
      if (answers.length === questions.length) finish();
      else showQuestion();
    }
    function showQuestion() {
      const { question, options } = questions[answers.length];
      const title = `${answers.length + 1}/${questions.length}: ${question}`;
      if (!options.length) {
        show(createInput(title, "cancel", theme, keybindings, submit, finish));
        return;
      }
      const choices = options.map(option => displayChoice(option, theme));
      const other = displayChoice(otherOption, theme);
      const selector = new ExtensionSelectorComponent(title, [...choices, other], choice => {
        if (choice === other) {
          show(createInput(title, "return to selection menu", theme, keybindings, submit, () => show(selector)));
        } else submit(options[choices.indexOf(choice)].label);
      }, finish);
      show(selector);
    }

    showQuestion();
    signal?.addEventListener("abort", finish, { once: true });
    if (signal?.aborted) finish();
    return {
      get focused() { return focused; },
      set focused(value: boolean) {
        focused = value;
        if ("focused" in page) page.focused = value;
      },
      render: (width: number) => page.render(width),
      invalidate: () => page.invalidate(),
      handleInput(data: string) {
        if (!finished) page.handleInput?.(data);
      },
      dispose() {
        finished = true;
        signal?.removeEventListener("abort", finish);
        page.dispose?.();
      },
    };
  });
}

function createInput(title: string, cancelLabel: string, theme: Theme, keybindings: KeybindingsManager,
  submit: (value: string) => void, cancel: () => void): Page {
  const input = new Input();
  const container = new Container();
  container.addChild(new DynamicBorder());
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("accent", title), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(input);
  container.addChild(new Spacer(1));
  container.addChild(new Text(
    `${keyHint("tui.select.confirm", "submit")}  ${keyHint("tui.select.cancel", cancelLabel)}`, 1, 0,
  ));
  container.addChild(new Spacer(1));
  container.addChild(new DynamicBorder());
  return {
    get focused() { return input.focused; },
    set focused(value: boolean) { input.focused = value; },
    render: (width: number) => container.render(width),
    invalidate: () => container.invalidate(),
    handleInput(data: string) {
      if (keybindings.matches(data, "tui.select.confirm") || data === "\n") submit(input.getValue());
      else if (keybindings.matches(data, "tui.select.cancel")) cancel();
      else input.handleInput(data);
    },
  };
}
