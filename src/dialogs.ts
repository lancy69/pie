import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { displayChoice, otherOption, type Answer, type Question } from "./questions.ts";

// RPC clients own their dialogs; keep their sequential UI requests.
export async function askDialogs(ctx: ExtensionContext, questions: Question[], signal?: AbortSignal): Promise<Answer[]> {
  const answers: Answer[] = [];
  for (const [index, question] of questions.entries()) {
    const title = `${index + 1}/${questions.length}: ${question.question}`;
    const answer = await askDialog(ctx, question, title, signal);
    if (answer === undefined) break;
    answers.push({ id: question.id, answer });
  }
  return answers;
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
