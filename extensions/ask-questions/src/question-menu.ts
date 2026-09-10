import type { Answer, Question } from "./questions.ts";

export type QuestionnaireResult = { answers: Answer[]; cancelled: boolean };

export function questionMenu(questions: Question[], answers: Map<number, string>): string[] {
  const items = questions.map((question, index) =>
    `${answers.has(index) ? "✓" : "○"} ${index + 1}. ${question.question}`);
  if (answers.size === questions.length) items.push("Submit answers");
  return items;
}

export function collectAnswers(questions: Question[], answers: Map<number, string>): Answer[] {
  return questions.flatMap((question, index) =>
    answers.has(index) ? [{ id: question.id, answer: answers.get(index)! }] : []);
}

export function menuTitle(questions: Question[], answers: Map<number, string>): string {
  return `Questions (${answers.size}/${questions.length} answered)`;
}
