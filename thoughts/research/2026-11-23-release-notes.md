# Release notes skills

Date: 2026-11-23. Tool: Claude Code on macOS, Node 24.14.1, Git 2.50.1. Question: how can this repository package two release notes skills that write a JSON file and an HTML file, and add only new changes on each run?

## Requirements

1. Skill 1 writes release notes for the project audience. The source is the production code.
2. Skill 1 writes a JSON file and an HTML file. A second run adds only new changes to the files.
3. The Skill 1 HTML page has a date filter. It shows the changes from new to old.
4. Skill 1 text obeys ASD-STE100 Simplified Technical English.
5. Skill 2 writes release notes for stakeholders. It writes a JSON file and an HTML file, and a second run adds only new changes.
6. Each Skill 2 change has tags that name the persons who did the work.
7. The Skill 2 HTML page has a date filter and a person filter. It shows the changes from new to old.

The user global rules also apply: STE for all text, atomic writes, and YAGNI.

## Repository conventions

| Topic | Fact | Source |
|---|---|---|
| Portable skill | A skill is a folder with `SKILL.md`, `scripts/`, and `assets/`. It has no npm dependencies. A user copies the folder into `.agents/skills/` or installs it with a skill installer. | `README.md`, `skills/spec100-setup/` |
| Skill front matter | `name` (same as the folder name) and `description` only. | `skills/spec100-setup/SKILL.md` |
| Generated code | `scripts/build.mjs` strips the types from `src/runtime.cts` and writes the generated `.cjs` file into the skill folder and the plugin. The generated output is committed. | `scripts/build.mjs` |
| CI | CI runs `npm run check` on Windows, Linux, and macOS, then runs `git diff --exit-code` on the generated folders. | `.github/workflows/ci.yml` |
| Type check | `tsc --noEmit` checks `src/**/*.cts` in strict mode. | `tsconfig.json` |
| Tests | `node:test` tests start the built script with `spawnSync` in a temporary folder. The tests use no network and no model. | `test/runtime.test.mjs` |
| Shell safety | Skills never put free-form user text into a shell command. They pass text in a temporary JSON file. | `skills/spec100-setup/SKILL.md` |
| Atomic writes | The runtime writes a temporary file and renames it. It uses a lock file to stop two writers. | `src/runtime.cts` |
| Research and plans | Dated files in `thoughts/research/` and `thoughts/plans/`, written in STE. | `thoughts/` |

The Claude plugin `plugins/spec100` holds harness commands only. Release notes are not part of the harness.

## Facts about the inputs

- Git gives each commit a full SHA, a committer date (`%cI`), an author name after `.mailmap` (`%aN`), and an author email (`%aE`).
- A pair programmer appears as a `Co-authored-by: Name <email>` trailer in the commit message. `git log --format=%(trailers:key=Co-authored-by,valueonly)` prints these values.
- `git rev-list --first-parent <base>..<ref>` lists the commits in the order that they arrived on a branch. On a merge workflow, each first-parent commit is one merge. On a squash or rebase workflow, each first-parent commit is one change. The committer date of a first-parent commit is the time that the change arrived on the branch.
- The authors of a merge are the authors of `<merge>^1..<merge>`, not the person who merged it.
- `git merge-base --is-ancestor <a> <b>` shows if `<b>` contains `<a>`. A force push can remove a recorded commit from the branch.
- A production branch has no standard name. Common names are `production`, `prod`, `release`, `main`, and `master`. Some teams deploy a tag. Only the user knows the correct reference.

## Facts about the outputs

- A model must write the text of the notes. A script cannot summarize a change for a reader. A script can collect the facts, check the text, merge the data, and write the files.
- The contributor names must come from Git, not from the model. A model can invent or drop a name.
- The STE limits that a script can check are the sentence lengths: 20 words for a procedural sentence and 25 words for a descriptive sentence. Release notes are descriptive. The approved word list and the voice need a human or a model to check.
- A static HTML file works offline and with no server. The page can show all entries without JavaScript. A small inline script can hide the entries that do not match a filter. `<input type="date">` gives `YYYY-MM-DD` values, which compare correctly as text.
- Text from commits and from the model can contain `<`, `&`, and quotes. The HTML must escape it.
- A rename is atomic for one file. Two renames (JSON, then HTML) are not atomic as a pair. If the process stops between them, the HTML is out of date. A second render from the JSON corrects it.

## Options

| Option | Assessment |
|---|---|
| A. The skill tells the model to edit the JSON file and the HTML file by hand. | The model can duplicate entries, break the JSON, invent names, and leave the HTML different from the JSON. No atomic write. Rejected. |
| B. A bundled script collects the new commits, and the model writes the text. The script checks the text, merges the entries into the JSON file, and writes the HTML file from the JSON file. | Deterministic merge, idempotent runs, Git-based names, atomic file writes. Selected. |
| C. A shared plugin or an npm package. | Adds an install step and a dependency. The repository delivers portable folders. Rejected. |

## Design constraints from the findings

- The JSON file is the source of truth. The script writes the full HTML file again from it on each run. To the reader, this adds the new changes to the page.
- The JSON file records a cursor: the last processed commit on the source branch. The next run reads only the commits after the cursor. The model can leave out internal commits, and they do not come back.
- An append must state the cursor that it started from. The script refuses the append if the cursor changed. This stops a lost update when two runs overlap. A lock file also stops two writers.
- Each entry lists its source commits. The script refuses a commit that is outside the collected range or that an entry already lists.
- The project audience page shows no names. The stakeholder page shows the Git names as tags.
- The script refuses to overwrite an HTML file that it did not write. It refuses to start a new JSON file when its HTML file already exists, because the old entries would be lost.
- Both skills share one script source. Each folder gets a generated copy, so that each folder stays portable.
