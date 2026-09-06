import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { askDialogs } from "./src/dialogs.ts";
import { prepareQuestions } from "./src/questions.ts";
import { askQuestionnaire } from "./src/questionnaire.ts";

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
      const prepared = prepareQuestions(questions);
      if (!ctx.hasUI) throw new Error("ask_questions requires an interactive UI.");
      const ask = ctx.mode === "tui" ? askQuestionnaire : askDialogs;
      const answers = await ask(ctx, prepared, signal);
      const details = { answers, cancelled: answers.length !== prepared.length };
      return { content: [{ type: "text", text: JSON.stringify(details) }], details };
    },
  });
}
