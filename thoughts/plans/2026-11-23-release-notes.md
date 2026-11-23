# Release notes skills plan

Source: `thoughts/research/2026-11-23-release-notes.md`. Date: 2026-11-23.

## Goal

Add two portable skills. `release-notes-project` writes notes for the project audience from the production branch. `release-notes-stakeholder` writes notes for stakeholders with contributor tags. Each skill writes a JSON file and an HTML file and adds only new changes on each run.

## Decisions

- Option B of the research: a bundled script does the Git work, the checks, and the file writes. The model writes the text.
- One source file, `src/release-notes.cts`. `npm run build` writes `scripts/release-notes.cjs` into both skill folders.
- The script has three commands: `collect` (read-only), `append`, and `render`. Each command takes `--kind project|stakeholder`.
- The source is the first-parent history of one Git reference. Skill 1 uses the production reference. Skill 2 uses the reference that the user names, or the production reference.
- The user confirms the reference on the first run. The JSON file keeps it for later runs.
- Entry types: `added`, `changed`, `fixed`, `removed`, `security`.
- The script refuses a title or a sentence of more than 25 words. The skill text gives the other STE rules to the model.
- Contributors come from the commit authors and the `Co-authored-by` trailers. The model cannot set them. The project kind stores no names.
- Default output: `release-notes/project.json` and `release-notes/project.html`, or `release-notes/stakeholder.json` and `release-notes/stakeholder.html`.
- The plugin `spec100` ships both skills. `npm run build` copies each skill and its script into `plugins/spec100/skills/`. The copied `SKILL.md` names the script as `${CLAUDE_PLUGIN_ROOT}/skills/<name>/scripts/release-notes.cjs`. The portable folders under `skills/` remain for other tools.
- Version 2.3.0, so that installed plugins update. No commit, because the user did not ask for one.

## Data format

```json
{
  "schema": 1,
  "kind": "stakeholder",
  "title": "Example stakeholder release notes",
  "source": { "ref": "origin/main", "cursor": "<full SHA>" },
  "updated": "2026-11-23T06:00:00.000Z",
  "entries": [
    {
      "id": "<12 hex characters>",
      "type": "fixed",
      "title": "The export keeps the column order",
      "description": "The CSV export now writes the columns in the order that the table shows.",
      "date": "2026-11-23",
      "landed": "2026-11-23T14:00:58+08:00",
      "commits": ["<full SHA>"],
      "contributors": ["Ana Cruz", "Ben Lee"]
    }
  ]
}
```

`id` is a hash of the sorted commit list. `landed` is the latest committer date of the commits. `date` is the first ten characters of `landed`. A project entry has no `contributors` field.

## Phase 1: script

File: `src/release-notes.cts`.

1. `collect --kind <k> --json <file> [--repo <dir>] [--ref <ref>] [--start <rev>] [--max <n>]`.
   - Read the JSON file if it exists. Use its reference and cursor. `--ref` replaces the reference. `--start` is valid only when no cursor exists.
   - Refuse when the cursor is not an ancestor of the reference.
   - List the first-parent commits after the cursor, oldest first, at most `--max` (default 100).
   - For each commit, print the SHA, the landed date, the subject, the body, the changed files, and, for a merge, the included commits. The stakeholder kind also prints the contributors.
   - Print `base`, `through`, and `remaining`. Write nothing.
2. `append --kind <k> --json <file> --html <file> --draft <file> --base <sha|none> --through <sha> [--repo <dir>] [--ref <ref>]`.
   - Take a lock file next to the JSON file. Create it exclusively. Remove it at the end.
   - Refuse a kind mismatch, an unknown schema, a base that is not the stored cursor, a new JSON file next to an old HTML file, and an HTML file without the generator mark.
   - Check the draft: allowed keys only, a known type, a title and sentences of 25 words or fewer, and full SHAs in the range `base..through` that no entry lists yet.
   - Add the entries. Set the cursor to `through`. Write the JSON file, then the HTML file. Each write goes to a temporary file in the same folder, then a rename.
3. `render --kind <k> --json <file> --html <file>` writes the HTML file again from the JSON file. It corrects an HTML file that a stopped run left out of date.
4. The HTML page:
   - It is one file with inline CSS and JavaScript and no network requests.
   - It groups the entries by date, new to old. In one date, the latest `landed` time is first.
   - It has `From` and `To` date fields. The stakeholder page also has a `Contributor` list and contributor tags on each entry.
   - It escapes all text. It works in light and dark mode and at phone width.

## Phase 2: skills and build

1. `skills/release-notes-project/SKILL.md`: find and confirm the production reference, collect, write the STE entries for end users, append, and report.
2. `skills/release-notes-stakeholder/SKILL.md`: the same steps for stakeholders, with contributor tags and the person filter.
3. `scripts/build.mjs`: write the generated script into both folders.
4. `package.json`: run the new test file in `npm test`.
5. `.github/workflows/ci.yml`: add the two folders to the generated-output diff check.

## Phase 3: tests

File: `test/release-notes.test.mjs`. Each test makes a temporary Git repository. No network.

1. The first run writes both files. A second run adds only the new commits.
2. A merge commit gives the authors of the merged commits and the co-authors.
3. The project kind stores no contributors and shows no person filter.
4. The HTML shows dates from new to old and escapes markup.
5. The script refuses a stale base, a duplicate commit, a commit outside the range, a long sentence, an unknown type, a kind mismatch, a foreign HTML file, a new JSON file next to an old HTML file, and an active lock. Each refusal leaves the files unchanged.
6. `--max` returns the oldest commits first, and `remaining` counts the others.
7. `render` writes the HTML file again.

## Phase 4: docs

1. README: a short section for the two skills.
2. This plan: the execution record.

## Acceptance

- `npm run check` passes.
- A run in a temporary repository writes a JSON file and an HTML file. A second run adds only new entries.
- The HTML filters work in a browser.

## Atomicity limits

- The JSON rename and the HTML rename are two operations. If the process stops between them, the HTML is out of date. `render` or the next `append` corrects it.
- A process that stops while it holds the lock leaves the lock file. The script does not remove it. The user removes it after a check that no other run is active.

## Rollback

Delete the two skill folders, `src/release-notes.cts`, and the test file. Restore `scripts/build.mjs`, `package.json`, the CI file, and the README from the previous commit.

## Not in scope

- Release versions or tags as groups.
- Entries without a commit.
- Removal or edit of a published entry.
- An automatic schedule.

## Execution record

Implemented on 2026-11-23 on macOS with Node 24.14.1 and Git 2.50.1. All phases are complete. Nothing is committed. The changes are on the local branch `turn-router`.

- `npm run check`: the type check passed. The runtime tests: 82 passed, 0 failed. The release notes tests: 7 passed, 0 failed.
- The existing CRLF build test now also builds the release notes script. It checks that the output is the same as the committed script.
- A browser check in Chrome used a sample stakeholder page on `127.0.0.1`. The page showed the changes from new to old. The contributor filter, the date filters, the empty result, and `Clear filters` worked.
- An independent review found four faults. All four are corrected:
  1. Commits in different time zones gave day sections in the wrong order and a `min` date after the `max` date. The sort now uses the calendar date first. A new test covers it.
  2. A failed HTML write after the JSON write gave an unclear error. The error now says that the JSON file changed and that `render` corrects the page.
  3. Too much Git output gave the message "Git did not start". The message now names the Git command and the cause.
  4. A `0x1E` character in a commit message split one record into two. The script now uses a random record mark. The new test covers it.

Residual risks:

- No run on Windows or Linux. The CI matrix covers them.
- Git 2.24 is the stated minimum for the trailer format. Only Git 2.50.1 was tested.
- The script checks only the STE sentence length. The model must obey the other STE rules.
- Contributor tags include bot accounts and AI co-author trailers.
- No live run of the two skills through an agent.

## Correction after review

The first implementation put the skills outside the plugin. That did not meet the request to package them. The build now writes both skills into `plugins/spec100/skills/`. The version is 2.3.0. A new test checks the plugin copies. `npm run check` passed: 82 runtime tests and 8 release notes tests. A run through the installed plugin in Claude Code is not done.

## Design change

The user asked for a minimal page with less visual clutter. The page now has no boxes, no colored labels, and no pill tags. On a wide screen, the date is in a narrow left column. The type and the contributors are one muted line under each entry. The count line shows only when a filter is active. `npm run check` passed: 82 runtime tests and 8 release notes tests. A browser check showed the new design and a working contributor filter.
