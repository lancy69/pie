# CRAP evaluation: question menu

## Scope and method

- Source: question-menu implementation accompanying this report, based on parent 135f2bf.
- Scope: index.ts and src/*.ts; tests, scripts, reports, dependencies, and generated output excluded.
- Node v26.8.1; TypeScript 5.9.3; existing scripts/crap.mjs analyzer.
- Automated McCabe-style cyclomatic complexity and per-routine V8 block coverage proxy, using the method documented in crap.md. This is not basis-path coverage.
- All 21 tests passed, including native TUI navigation, editing, explicit submission, empty answers, cancellation, and RPC behavior. Real Pi smoke testing also passed.
- No before/after comparison: the test suite and behavior changed for this feature.

## Summary

| Measured routines | Unmeasured routines | CRAP > 30 | Percentage | Highest score | CRAP > 6 | CRAP > 4 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 55 | 0 | 0 | 0% | 4.0 | 0 | 0 |

## Highest scores

| CRAP | Complexity | Coverage | Routine | Location |
| ---: | ---: | ---: | --- | --- |
| 4.0 | 4 | 100.0% | answerFromMenu | src/dialogs.ts:17 |
| 4.0 | 4 | 100.0% | prompt | src/dialogs.ts:35 |
| 4.0 | 4 | 100.0% | askChoice | src/dialogs.ts:49 |
| 4.0 | 4 | 100.0% | <anonymous> | src/questionnaire.ts:17 |
| 4.0 | 4 | 100.0% | show | src/questionnaire.ts:31 |
| 4.0 | 4 | 100.0% | handleInput | src/questionnaire.ts:115 |
| 4.0 | 4 | 100.0% | validateOptions | src/questions.ts:32 |
| 3.3 | 3 | 66.7% | finish | src/questionnaire.ts:24 |
| 3.0 | 3 | 100.0% | execute | index.ts:25 |
| 3.0 | 3 | 100.0% | askDialogs | src/dialogs.ts:7 |
| 3.0 | 3 | 100.0% | askQuestionnaire | src/questionnaire.ts:13 |
| 3.0 | 3 | 100.0% | handleInput | src/questionnaire.ts:82 |
| 3.0 | 3 | 100.0% | dispose | src/questionnaire.ts:85 |
| 3.0 | 3 | 100.0% | validateIds | src/questions.ts:15 |
| 3.0 | 3 | 100.0% | prepareQuestion | src/questions.ts:21 |

## Measurement gaps

No unmatched or ambiguous routine ranges. Coverage remains a V8 block proxy; it does not prove every path or assertion. Lower-scoring routines include unexecuted focus getters; these are not treated as covered.

## Reproduce

```sh
npm run check
coverage_dir=$(mktemp -d)
NODE_V8_COVERAGE="$coverage_dir" node --experimental-strip-types --test test/*.test.ts
node scripts/crap.mjs "$coverage_dir"
```
