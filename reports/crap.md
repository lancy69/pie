# CRAP evaluation

## Scope and method

- Baseline revision: e2e19c963ae93900572da0abe19efbcaea7fccac. Refactored source: the tree accompanying this report, identified by SHA-256 below.
- Production scope: index.ts and src/*.ts. Tests, scripts, reports, dependencies, generated files, and package metadata are excluded.
- Both trees pass the identical final 18-test suite. The original tree was exported to a temporary directory and tested with the final test files, including the initial-render abort regression case.
- Complexity analyzer: scripts/crap.mjs using the existing TypeScript 5.9.3 compiler API. Automated McCabe-style counting starts at one and counts if, conditional expressions, loops, catches, non-default switch cases, logical operators/assignments, default parameters/bindings, and optional-chain branches. Nested routine decisions are excluded from their parent. This is cyclomatic complexity, not cognitive complexity; optional/default branches are counted conservatively.
- Runtime and coverage: Node v26.8.1, native strip-types execution and NODE_V8_COVERAGE. Coverage is a **per-routine V8 block coverage proxy**, including each function's root and reported subranges, not basis-path coverage or a claim of complete branch/path coverage.
- Coverage is joined to AST routines by canonical file path and exact source-range end plus start within the function header. Native stripping preserves source offsets. Nested functions and anonymous callbacks are measured separately; locations disambiguate duplicate names.
- Process coverage is merged by range; an omitted child range inherits the nearest enclosing range count. Counts shown below are covered/total reported ranges for that routine. No file-wide percentages are assigned to routines.
- Formula: CRAP = complexity² × (1 − coverage/100)³ + complexity. Comparisons use unrounded values; tables round for display.

## Summary

Before:

| Measured routines | Unmeasured routines | CRAP > 30 | Percentage | Highest score | CRAP > 6 | CRAP > 4 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 27 | 0 | 1 | 3.7% | 38.0 | 1 | 2 |

After:

| Measured routines | Unmeasured routines | CRAP > 30 | Percentage | Highest score | CRAP > 6 | CRAP > 4 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 43 | 0 | 0 | 0.0% | 4.0 | 0 | 0 |

All 43 refactored routines meet the stretch target of CRAP ≤ 4.0 under this method. The registered tool's execute routine drops from 38.0 to 3.0. Normalization and validation now have named routines; RPC prompting is separated from tool registration; native and RPC menus reuse normalized option formatting. Public tool input and results are unchanged.

## Hotspots and changes

| Before | After | Routine | Change |
| ---: | ---: | --- | --- |
| 38.0 | 3.0 | index.ts execute | Separate input preparation, RPC interaction, and result assembly. |
| 5.2 | 2.0 | questionnaire submit | Remove its redundant late-input guard: the mounted component gates input after completion, and the abort listener closes synchronously. Tests exercise late input after completion and abort. |

New routines in src/dialogs.ts and src/questions.ts are listed only in the after table; the former index.ts formatChoice is listed only in the before table. Anonymous callbacks changed as responsibilities moved. No missing routine is assigned a zero score, and no project-wide CRAP score is calculated.

## Refactored routine measurements

| CRAP | Complexity | Coverage | Routine | Location |
| ---: | ---: | ---: | --- | --- |
| 4.0 | 4 | 100.0% (6/6) | prompt | src/dialogs.ts:16 |
| 4.0 | 4 | 100.0% (5/5) | askChoice | src/dialogs.ts:30 |
| 4.0 | 4 | 100.0% (4/4) | <anonymous> | src/questionnaire.ts:15 |
| 4.0 | 4 | 100.0% (4/4) | show | src/questionnaire.ts:26 |
| 4.0 | 4 | 100.0% (6/6) | handleInput | src/questionnaire.ts:97 |
| 4.0 | 4 | 100.0% (5/5) | validateOptions | src/questions.ts:32 |
| 3.3 | 3 | 66.7% (2/3) | finish | src/questionnaire.ts:20 |
| 3.0 | 3 | 100.0% (6/6) | execute | index.ts:25 |
| 3.0 | 3 | 100.0% (4/4) | askDialogs | src/dialogs.ts:5 |
| 3.0 | 3 | 100.0% (4/4) | askQuestionnaire | src/questionnaire.ts:11 |
| 3.0 | 3 | 100.0% (2/2) | handleInput | src/questionnaire.ts:65 |
| 3.0 | 3 | 100.0% (3/3) | dispose | src/questionnaire.ts:68 |
| 3.0 | 3 | 100.0% (3/3) | validateIds | src/questions.ts:15 |
| 3.0 | 3 | 100.0% (3/3) | prepareQuestion | src/questions.ts:21 |
| 2.0 | 2 | 100.0% (3/3) | askDialog | src/dialogs.ts:24 |
| 2.0 | 2 | 100.0% (2/2) | <anonymous> | src/dialogs.ts:25 |
| 2.0 | 2 | 100.0% (3/3) | resolveChoice | src/dialogs.ts:34 |
| 2.0 | 2 | 100.0% (3/3) | submit | src/questionnaire.ts:32 |
| 2.0 | 2 | 100.0% (3/3) | showQuestion | src/questionnaire.ts:37 |
| 2.0 | 2 | 100.0% (3/3) | <anonymous> | src/questionnaire.ts:46 |
| 2.0 | 1 | 0.0% (0/1) | focused | src/questionnaire.ts:58 |
| 2.0 | 2 | 100.0% (2/2) | focused | src/questionnaire.ts:59 |
| 2.0 | 1 | 0.0% (0/1) | focused | src/questionnaire.ts:93 |
| 2.0 | 2 | 100.0% (3/3) | prepareQuestions | src/questions.ts:9 |
| 2.0 | 2 | 100.0% (1/1) | prepareOption | src/questions.ts:28 |
| 2.0 | 2 | 100.0% (2/2) | <anonymous> | src/questions.ts:34 |
| 2.0 | 2 | 100.0% (3/3) | displayChoice | src/questions.ts:45 |
| 1.0 | 1 | 100.0% (1/1) | questions | index.ts:7 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/dialogs.ts:25 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/dialogs.ts:32 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/dialogs.ts:39 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questionnaire.ts:44 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questionnaire.ts:48 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questionnaire.ts:63 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questionnaire.ts:64 |
| 1.0 | 1 | 100.0% (1/1) | createInput | src/questionnaire.ts:77 |
| 1.0 | 1 | 100.0% (1/1) | focused | src/questionnaire.ts:94 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questionnaire.ts:95 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questionnaire.ts:96 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questions.ts:11 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questions.ts:16 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questions.ts:33 |
| 1.0 | 1 | 100.0% (1/1) | formatChoice | src/questions.ts:41 |

## Baseline routine measurements

| CRAP | Complexity | Coverage | Routine | Location |
| ---: | ---: | ---: | --- | --- |
| 38.0 | 38 | 100.0% (53/53) | execute | index.ts:27 |
| 5.2 | 5 | 80.0% (4/5) | submit | src/questionnaire.ts:32 |
| 4.0 | 4 | 100.0% (4/4) | <anonymous> | src/questionnaire.ts:15 |
| 4.0 | 4 | 100.0% (4/4) | show | src/questionnaire.ts:26 |
| 4.0 | 4 | 100.0% (6/6) | handleInput | src/questionnaire.ts:99 |
| 3.3 | 3 | 66.7% (2/3) | finish | src/questionnaire.ts:20 |
| 3.0 | 3 | 100.0% (4/4) | <anonymous> | index.ts:55 |
| 3.0 | 3 | 100.0% (4/4) | askQuestionnaire | src/questionnaire.ts:11 |
| 3.0 | 3 | 100.0% (4/4) | showQuestion | src/questionnaire.ts:38 |
| 3.0 | 3 | 100.0% (4/4) | <anonymous> | src/questionnaire.ts:45 |
| 3.0 | 3 | 100.0% (2/2) | handleInput | src/questionnaire.ts:67 |
| 3.0 | 3 | 100.0% (3/3) | dispose | src/questionnaire.ts:70 |
| 2.0 | 2 | 100.0% (2/2) | formatChoice | index.ts:5 |
| 2.0 | 2 | 100.0% (2/2) | <anonymous> | index.ts:35 |
| 2.0 | 2 | 100.0% (3/3) | <anonymous> | src/questionnaire.ts:48 |
| 2.0 | 1 | 0.0% (0/1) | focused | src/questionnaire.ts:60 |
| 2.0 | 2 | 100.0% (2/2) | focused | src/questionnaire.ts:61 |
| 2.0 | 1 | 0.0% (0/1) | focused | src/questionnaire.ts:95 |
| 1.0 | 1 | 100.0% (1/1) | questions | index.ts:9 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | index.ts:34 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questionnaire.ts:50 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questionnaire.ts:65 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questionnaire.ts:66 |
| 1.0 | 1 | 100.0% (1/1) | createInput | src/questionnaire.ts:79 |
| 1.0 | 1 | 100.0% (1/1) | focused | src/questionnaire.ts:96 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questionnaire.ts:97 |
| 1.0 | 1 | 100.0% (1/1) | <anonymous> | src/questionnaire.ts:98 |

## Reproduce

No new dependencies or manifest changes are needed:

```sh
npm run check
coverage_dir=$(mktemp -d)
NODE_V8_COVERAGE="$coverage_dir" node --experimental-strip-types --test test/*.test.ts
node scripts/crap.mjs "$coverage_dir"
```

Use a fresh coverage directory each run. To repeat the baseline comparison from the refactored checkout:

```sh
baseline_dir=$(mktemp -d)
git archive e2e19c963ae93900572da0abe19efbcaea7fccac | tar -x -C "$baseline_dir"
cp test/*.test.ts "$baseline_dir/test/"
mkdir "$baseline_dir/scripts"
cp scripts/crap.mjs "$baseline_dir/scripts/"
ln -s "$PWD/node_modules" "$baseline_dir/node_modules"
cd "$baseline_dir"
NODE_V8_COVERAGE="$baseline_dir/coverage" node --experimental-strip-types --test test/*.test.ts
node scripts/crap.mjs "$baseline_dir/coverage"
```

## Measurement gaps

- No missing or ambiguous routine matches in either tree. Two refactored focus getters are measured at 0% execution; their score is 2.0, not silently treated as covered. The idempotent finish guard retains an uncovered redundant-call path. Coverage is not proof of assertion strength.
- V8 block coverage does not enumerate all possible branches or basis paths; scores are comparable using this declared proxy, not interchangeable with scores from another coverage model.
- The analyzer is scoped to this repository's top-level index.ts and immediate src/*.ts files. Extend discovery if production sources move into deeper folders.

Source and test fingerprints:

```text
f1f9e9c3f7105d9029345b0d9475b0f426e918fecca3b7bc216330ede10a44d5  index.ts
e58da19530282572d5be8e1cf66d5af32b677705922401ff6e4085c8435adcbf  src/dialogs.ts
405037f7a8a681f46979319c286ea3db05ba3b7f2a6887f08b028db3f849a764  src/questionnaire.ts
672a3179b952aaad05de919848c68c76a2415b52b0795cb0176d3ebe210eb23a  src/questions.ts
b4fc4680d89c06e03d707477d704024ccf72eac19f4fcf87f0da1770395ac94e  test/extension.test.ts
0d3aaf9e19960917fc4e13607fe6e9800c70d1d4bd72f2e63bd684459195ab0a  test/questionnaire.test.ts
```
