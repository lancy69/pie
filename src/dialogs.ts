import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { displayChoice, otherOption, type Question } from "./questions.ts";

import { collectAnswers, menuTitle, questionMenu, type QuestionnaireResult } from "./question-menu.ts";

// RPC clients own their dialogs; keep their sequential UI requests.
export async function askDialogs(ctx: ExtensionContext, questions: Question[], signal?: AbortSignal): Promise<QuestionnaireResult> {
  if (questions.length === 1) return askSingle(ctx, questions[0], signal);
  const answers = new Map<number, string>();
  let outcome;
  do {
    outcome = await answerFromMenu(ctx, questions, answers, signal);
  } while (outcome === undefined);
  return { answers: collectAnswers(questions, answers), cancelled: outcome === "cancelled" };
}

async function answerFromMenu(ctx: ExtensionContext, questions: Question[], answers: Map<number, string>,
  signal?: AbortSignal): Promise<"submitted" | "cancelled" | undefined> {
  const items = questionMenu(questions, answers);
  const selected = await prompt(signal, () => ctx.ui.select(menuTitle(questions, answers), items, { signal }));
  if (selected === undefined) return "cancelled";
  const index = items.indexOf(selected);
  if (index === questions.length) return "submitted";
  const answer = await askDialog(ctx, questions[index], `${index + 1}/${questions.length}: ${questions[index].question}`, signal);
  if (answer === undefined) return "cancelled";
  answers.set(index, answer);
}

async function askSingle(ctx: ExtensionContext, question: Question, signal?: AbortSignal): Promise<QuestionnaireResult> {
  const answer = await askDialog(ctx, question, `1/1: ${question.question}`, signal);
  if (answer === undefined) return { answers: [], cancelled: true };
  return { answers: [{ id: question.id, answer }], cancelled: false };
}

async function prompt(signal: AbortSignal | undefined, action: () => Promise<string | undefined>) {
  const cancellation = signal ?? { aborted: false };
  if (cancellation.aborted) return undefined;
  const answer = await action();
  if (cancellation.aborted) return undefined;
  return answer;
}

function askDialog(ctx: ExtensionContext, question: Question, title: string, signal?: AbortSignal) {
  const readAnswer = async () => (await prompt(signal, () => ctx.ui.input(title, undefined, { signal })))?.trim();
  if (!question.options.length) return readAnswer();
  return askChoice(ctx, question, title, signal, readAnswer);
}

async function askChoice(ctx: ExtensionContext, question: Question, title: string, signal: AbortSignal | undefined,
  readAnswer: () => Promise<string | undefined>): Promise<string | undefined> {
  const choices = question.options.map(option => displayChoice(option, ctx.ui.theme));
  const other = displayChoice(otherOption, ctx.ui.theme);
  function resolveChoice(selected: string) {
    if (selected === other) return readAnswer();
    return question.options[choices.indexOf(selected)].label;
  }
  while (true) {
    const selected = await prompt(signal, () => ctx.ui.select(title, [...choices, other], { signal }));
    if (selected === undefined) return undefined;
    const answer = await resolveChoice(selected);
    if (answer !== undefined) return answer;
  }
}
