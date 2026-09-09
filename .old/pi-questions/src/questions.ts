import type { Theme } from "@earendil-works/pi-coding-agent";

export type QuestionInput = { id: string; question: string; options?: { label: string; description?: string }[] };
export type Option = { label: string; description: string };
export type Question = { id: string; question: string; options: Option[] };
export type Answer = { id: string; answer: string };
export const otherOption: Option = { label: "Other", description: "Type your own answer" };

export function prepareQuestions(questions: QuestionInput[]): Question[] {
  if (!questions.length) throw new Error("At least one question is required.");
  validateIds(questions.map(question => question.id.trim()));
  return questions.map(prepareQuestion);
}

function validateIds(ids: string[]) {
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
    throw new Error("Question IDs must be nonblank and unique.");
  }
}

function prepareQuestion({ id, question, options = [] }: QuestionInput): Question {
  if (!question.trim()) throw new Error("Question must not be blank.");
  const choices = options.map(prepareOption);
  validateOptions(choices);
  return { id, question, options: choices };
}

function prepareOption({ label, description = "" }: { label: string; description?: string }): Option {
  return { label: label.trim(), description: description.trim() };
}

function validateOptions(options: Option[]) {
  const labels = options.map(option => option.label);
  if (labels.some(label => !label || label === "Other") || new Set(labels).size !== labels.length) {
    throw new Error("Options must be nonblank, unique, and must not use the reserved label Other.");
  }
  const display = [...options, otherOption].map(formatChoice);
  if (new Set(display).size !== display.length) throw new Error("Options must have unique display text.");
}

function formatChoice({ label, description }: Option): string {
  return [label, description].filter(Boolean).join(" ");
}

export function displayChoice({ label, description }: Option, theme: Theme): string {
  return label + (description ? theme.fg("dim", ` ${description}`) : "");
}
