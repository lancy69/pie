import {
  DynamicBorder, ExtensionSelectorComponent, keyHint,
  type ExtensionContext, type KeybindingsManager, type Theme,
} from "@earendil-works/pi-coding-agent";
import { Container, Input, Spacer, Text, matchesKey, truncateToWidth, type Component, type Focusable } from "@earendil-works/pi-tui";

import { displayChoice, otherOption, type Question } from "./questions.ts";

import { collectAnswers, type QuestionnaireResult } from "./question-menu.ts";

type Page = Component & Partial<Focusable> & { dispose?(): void };

export async function askQuestionnaire(ctx: ExtensionContext, questions: Question[], signal?: AbortSignal): Promise<QuestionnaireResult> {
  const answers = new Map<number, string>();
  if (signal?.aborted) return { answers: [], cancelled: true };

  return ctx.ui.custom<QuestionnaireResult>((tui, theme, keybindings, done) => {
    let index = 0;
    const single = questions.length === 1;
    let page: Page;
    const pages = new Map<number, Page>();
    let focused = false;
    let finished = false;

    function finish(cancelled: boolean) {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", cancel);
      done({ answers: collectAnswers(questions, answers), cancelled });
    }
    const cancel = () => finish(true);
    function show(next: Page, remember = true) {
      if (page && "focused" in page) page.focused = false;
      page = next;
      if (remember) pages.set(index, page);
      if ("focused" in page) page.focused = focused;
      tui.requestRender();
    }
    function submit(answer: string) {
      answers.set(index, answer.trim());
      if (single) finish(false);
      else if (answers.size === questions.length) {
        show(new ExtensionSelectorComponent("All questions answered", ["Submit answers"], () => finish(false), cancel), false);
      } else nextQuestion();
    }
    function showQuestion() {
      const { question, options } = questions[index];
      const title = single ? `1/1: ${question}` : question;
      if (!options.length) {
        show(createInput(title, "cancel", theme, keybindings, submit, cancel, answers.get(index)));
        return;
      }
      const choices = options.map(option => displayChoice(option, theme));
      const other = displayChoice(otherOption, theme);
      const selector = new ExtensionSelectorComponent(title, [...choices, other], choice => {
        if (choice === other) {
          show(createInput(title, "return to selection menu", theme, keybindings, submit, () => show(selector), answers.get(index)));
        } else submit(options[choices.indexOf(choice)].label);
      }, cancel);
      show(selector);
    }

    function nextQuestion() {
      index = (index + 1) % questions.length;
      const saved = pages.get(index);
      if (saved) show(saved);
      else showQuestion();
    }
    showQuestion();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    return {
      get focused() { return focused; },
      set focused(value: boolean) {
        focused = value;
        if ("focused" in page) page.focused = value;
      },
      render(width: number) {
        if (single) return page.render(width);
        const counter = truncateToWidth(`${index + 1} / ${questions.length}`, width, "");
        return [theme.fg("dim", counter.padStart(width)), ...page.render(width),
          theme.fg("dim", truncateToWidth(" tab next question", width, ""))];
      },
      invalidate: () => page.invalidate(),
      handleInput(data: string) {
        if (finished) return;
        if (!single && matchesKey(data, "tab")) nextQuestion();
        else page.handleInput?.(data);
      },
      dispose() {
        finished = true;
        signal?.removeEventListener("abort", cancel);
        page.dispose?.();
      },
    };
  });
}

function createInput(title: string, cancelLabel: string, theme: Theme, keybindings: KeybindingsManager,
  submit: (value: string) => void, cancel: () => void, initial = ""): Page {
  const input = new Input();
  input.setValue(initial);
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
