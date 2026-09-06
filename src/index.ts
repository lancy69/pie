import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function questions(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_question",
    label: "Ask Question",
    description: "Ask the user a question when you need clarification or a decision.",
    parameters: Type.Object({
      question: Type.String({ minLength: 1, description: "The question to ask" }),
      options: Type.Optional(Type.Array(Type.String({ minLength: 1 }), {
        description: "Single-choice options; omit for a text answer. Other is added automatically.",
      })),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, { question, options }, signal, _onUpdate, ctx) {
      if (!question.trim()) throw new Error("Question must not be blank.");
      const choices = options?.map(option => option.trim()) ?? [];
      if (choices.some(option => !option || option === "Other") || new Set(choices).size !== choices.length) {
        throw new Error("Options must be nonblank, unique, and must not use the reserved label Other.");
      }
      if (!ctx.hasUI) throw new Error("ask_question requires an interactive UI.");

      let answer: string | undefined;
      let cancelled = signal?.aborted ?? false;
      if (choices.length && !cancelled) {
        const choice = await ctx.ui.select(question, [...choices, "Other"], { signal });
        cancelled = signal?.aborted === true || choice === undefined;
        if (!cancelled && choice !== "Other") answer = choice;
      }
      while (!answer && !cancelled && !signal?.aborted) {
        const input = await ctx.ui.input(question, undefined, { signal });
        if (signal?.aborted || input === undefined) break;
        answer = input.trim();
        if (answer) break;
        answer = undefined;
      }
      const details = { answer: answer ?? null, cancelled: answer === undefined };
      return { content: [{ type: "text", text: JSON.stringify(details) }], details };
    },
  });
}
