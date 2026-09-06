import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function questions(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_question",
    label: "Ask Question",
    description: "Ask the user a question when you need clarification or a decision.",
    parameters: Type.Object({
      question: Type.String({ minLength: 1, description: "The question to ask" }),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, { question }, signal, _onUpdate, ctx) {
      if (!question.trim()) throw new Error("Question must not be blank.");
      if (!ctx.hasUI) throw new Error("ask_question requires an interactive UI.");

      let answer: string | undefined;
      while (!signal?.aborted) {
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
