import {
  DynamicBorder, ExtensionSelectorComponent, keyHint, rawKeyHint,
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
    function addNavigation(container: Container, hints = `${rawKeyHint("↑↓", "navigate")}  ${keyHint("tui.select.confirm", "select")}  ${keyHint("tui.select.cancel", "cancel")}`) {
      if (single) return;
      // Native dialogs expose their frame children: title first, key hints last.
      const titleIndex = container.children.findIndex(child => "setText" in child);
      container.children.splice(titleIndex, 0, {
        invalidate() {},
        render(width: number) {
          const innerWidth = Math.max(0, width - 2);
          const counter = truncateToWidth(`${index + 1} / ${questions.length}`, innerWidth, "");
          return [theme.fg("border", ` ${counter.padStart(innerWidth)} `.slice(0, width))];
        },
      });
      const footerIndex = container.children.map(child => "setText" in child).lastIndexOf(true);
      container.children[footerIndex] = new Text(
        `${hints}  ${rawKeyHint("tab", "cycle")}`, 1, 0,
      );
    }
    function createSelector(title: string, choices: string[], select: (choice: string) => void): Page {
      const selector = new ExtensionSelectorComponent(title, choices, select, cancel);
      addNavigation(selector);
      return selector;
    }
    function submit(answer: string) {
      answers.set(index, answer.trim());
      if (single) finish(false);
      else if (answers.size === questions.length) {
        show(createSelector("All questions answered", ["Submit answers"], () => finish(false)), false);
      } else nextQuestion();
    }
    function showQuestion() {
      const { question, options } = questions[index];
      const title = single ? `1/1: ${question}` : question;
      if (!options.length) {
        show(createInput(title, "cancel", theme, keybindings, submit, cancel, answers.get(index), addNavigation));
        return;
      }
      const choices = options.map(option => displayChoice(option, theme));
      const other = displayChoice(otherOption, theme);
      const selector = createSelector(title, [...choices, other], choice => {
        if (choice === other) {
          show(createInput(title, "return to selection menu", theme, keybindings, submit, () => show(selector), answers.get(index), addNavigation));
        } else submit(options[choices.indexOf(choice)].label);
      });
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
      render: (width: number) => page.render(width),
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
  submit: (value: string) => void, cancel: () => void, initial = "", decorate?: (container: Container, hints: string) => void): Page {
  const input = new Input();
  input.setValue(initial);
  const container = new Container();
  container.addChild(new DynamicBorder(value => theme.fg("border", value)));
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("accent", title), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(input);
  container.addChild(new Spacer(1));
  container.addChild(new Text(
    `${keyHint("tui.select.confirm", "submit")}  ${keyHint("tui.select.cancel", cancelLabel)}`, 1, 0,
  ));
  container.addChild(new Spacer(1));
  container.addChild(new DynamicBorder(value => theme.fg("border", value)));
  decorate?.(container, `${keyHint("tui.select.confirm", "submit")}  ${keyHint("tui.select.cancel", cancelLabel)}`);
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
