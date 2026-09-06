# pi-questions

A small Pi extension that provides `ask_questions` using Pi's native selection and text-input dialogs. Questions appear one at a time with progress labels.

## Install

Requires Pi 0.84.4 or later and Node.js 22.19.0 or later. Tested with Pi 0.84.4.

From this directory:

```sh
npm install
pi install .
```

Reload an existing Pi session with `/reload`, or start a new session.

To try it without installing the package:

```sh
pi -e ./src/index.ts
```

Ask Pi to use `ask_questions` when you want it to collect choices or written answers.

## Tool input

```json
{
  "questions": [
    {
      "id": "language",
      "question": "Which language should we use?",
      "options": [
        { "label": "TypeScript", "description": "Static types and editor support" },
        { "label": "JavaScript" }
      ]
    },
    {
      "id": "requirements",
      "question": "Any other requirements?"
    }
  ]
}
```

- Provide at least one question, with unique nonblank IDs and nonblank question text.
- Options are optional. Omitted or empty options open text input directly.
- Choice questions allow one selection and automatically include **Other** with a dimmed **Type your own answer** hint, which opens text input.
- Each option is an object with a `label` and optional `description` (replacing the earlier string format). Descriptions appear as `label description`, with the description in Pi's dim theme color; only the label is returned. Descriptions are trimmed, and blank descriptions are omitted.
- Display text must be unique so each selection maps to exactly one label.
- Option labels are trimmed and must be nonblank and unique. **Other** is reserved.
- Typed answers are trimmed. Enter on an empty or whitespace-only Other input submits an empty answer (`""`) and advances to the next question. Blank submissions on text-only questions prompt again.
- All questions are validated before any dialog opens. IDs are returned as supplied; IDs differing only in surrounding whitespace are rejected as duplicates.

## Tool result

The tool returns the same JSON in its text content and structured `details`:

```json
{
  "answers": [
    { "id": "language", "answer": "TypeScript" },
    { "id": "requirements", "answer": "Keep dependencies small." }
  ],
  "cancelled": false
}
```

Use the dialog's navigation keys and Enter to select or submit. Escape from an Other text input returns to the same question’s selection menu. Escape from the selection menu or a text-only question cancels the remaining questionnaire. Completed answers are preserved and `cancelled` is `true`; unanswered questions are absent from `answers`.

In Pi's terminal UI, the Other input footer labels the configured Escape/cancel keys as **return to selection menu**. This page uses Pi's native TUI components. RPC clients retain their own input dialog and footer.

Execution aborts also stop further prompts and discard an unfinished answer. Pi controls delivery of an aborted tool result. Calls without an interactive UI fail with an explicit error.

The extension uses Pi's default tool rendering. It has no navigation to earlier questions, embedded custom input, multi-select, or saved questionnaire state.

## Development

The entrypoint is `src/index.ts`; Pi loads TypeScript directly without a build step.

```sh
npm install
npm run check
npm test
```

Tests use Node's built-in runner and mocked Pi dialogs to cover validation, sequencing, choices, text input, cancellation, and aborts.
