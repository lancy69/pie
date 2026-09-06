import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

function formatChoice(option: { label: string; description?: string }): string {
  return [option.label.trim(), option.description?.trim()].filter(Boolean).join(" — ");
}

export default function questions(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_questions",
    label: "Ask Questions",
    description: "Ask the user one or more questions when you need clarification or decisions. Supports single-choice and text answers.",
    parameters: Type.Object({
      questions: Type.Array(Type.Object({
        id: Type.String({ minLength: 1, description: "Unique question identifier" }),
        question: Type.String({ minLength: 1, description: "The question to ask" }),
        options: Type.Optional(Type.Array(Type.Object({
          label: Type.String({ minLength: 1, description: "Choice label returned as the answer" }),
          description: Type.Optional(Type.String({ description: "Optional explanation displayed beside the label" })),
        }), {
          description: "Single-choice options; omit for a text answer. Other is added automatically.",
        })),
      }), { minItems: 1 }),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, { questions }, signal, _onUpdate, ctx) {
      if (!questions.length) throw new Error("At least one question is required.");
      const ids = new Set<string>();
      for (const { id, question, options } of questions) {
        if (!id.trim() || ids.has(id.trim())) throw new Error("Question IDs must be nonblank and unique.");
        ids.add(id.trim());
        if (!question.trim()) throw new Error("Question must not be blank.");
        const choices = options?.map(option => option.label.trim()) ?? [];
        if (choices.some(option => !option || option === "Other") || new Set(choices).size !== choices.length) {
          throw new Error("Options must be nonblank, unique, and must not use the reserved label Other.");
        }
        if (new Set(options?.map(formatChoice)).size !== choices.length) {
          throw new Error("Options must have unique display text.");
        }
      }
      if (!ctx.hasUI) throw new Error("ask_questions requires an interactive UI.");

      const answers: { id: string; answer: string }[] = [];
      for (const [index, { id, question, options }] of questions.entries()) {
        if (signal?.aborted) break;
        const title = `${index + 1}/${questions.length}: ${question}`;
        const choices = options?.map(formatChoice) ?? [];
        let answer: string | undefined;
        if (choices.length) {
          const choice = await ctx.ui.select(title, [...choices, "Other"], { signal });
          if (signal?.aborted || choice === undefined) break;
          if (choice !== "Other") answer = options![choices.indexOf(choice)].label.trim();
        }
        while (!answer && !signal?.aborted) {
          const input = await ctx.ui.input(title, undefined, { signal });
          if (signal?.aborted || input === undefined) break;
          answer = input.trim();
        }
        if (!answer || signal?.aborted) break;
        answers.push({ id, answer });
      }
      const details = { answers, cancelled: answers.length !== questions.length };
      return { content: [{ type: "text", text: JSON.stringify(details) }], details };
    },
  });
}
