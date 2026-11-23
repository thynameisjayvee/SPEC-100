---
name: release-notes-project
description: Write or update release notes for the project audience (end users and customers) from the production branch. Writes a JSON file and an HTML page with a date filter, newest first, in ASD-STE100 Simplified Technical English. A second run adds only the new production changes. Use when the user asks for release notes, a changelog, or "what changed in production" for users.
---

The bundled script does the Git work, the checks, and the file writes. You write the text of the notes. Never edit the JSON file or the HTML file by hand.

## Requirements

- Node.js 22.13 or later and Git 2.24 or later.
- `<script>` below is `${CLAUDE_PLUGIN_ROOT}/skills/release-notes-project/scripts/release-notes.cjs`.
- Put each path in quotes in a shell command. Never put free-form user text into a shell command. Pass text in the draft file.

## Procedure

1. Select the output files. The default is `release-notes/project.json` and `release-notes/project.html` in the repository root. Use other paths only when the user names them. Use the same paths on each run.
2. If the JSON file exists, it records the production reference. Go to step 4.
3. On the first run, find the production reference:
   1. List the candidates with `git branch -a` and `git tag --sort=-creatordate`.
   2. Ask the user which branch or tag is in production. Do not guess.
   3. Ask where the notes start: a tag, a commit, or the full history.
4. If the reference is a remote branch, ask the user before you run `git fetch <remote>`. A fetch makes the reference current.
5. Collect the new production commits:

   ```sh
   node "<script>" collect --kind project --json "<json>" --repo "<repo>" [--ref "<ref>"] [--start "<rev>"]
   ```

   - Give `--ref` on the first run. Give `--start` only on the first run, and only when the user selected a start point.
   - The command writes nothing. It prints `base`, `through`, `remaining`, and the commits, oldest first.
   - If `commits` is empty, tell the user that production has no new changes. Stop.
6. Read each commit. Use `git show <sha>` when the subject and the body do not explain the change.
7. Select the changes that the project audience can see or must know about. Leave out refactors, tests, CI, build changes, internal documents, and dependency updates without a visible effect. Put related commits into one entry.
8. Write each entry for the project audience. Obey the STE rules below.
   - `type`: `added` (a new feature), `changed` (a change to a feature), `fixed` (a fault correction), `removed` (a removed feature), or `security` (a security correction).
   - `title`: one short statement of the effect. Use 10 words or fewer.
   - `description`: one to three sentences. Tell what changed for the user. Tell what the user must do, if an action is necessary.
   - `commits`: the full SHAs from step 5 that the entry describes.
   - Do not write person names, ticket numbers, file paths, commit hashes, or the details of a security weakness.
9. Write the draft to a temporary file outside the repository:

   ```json
   {
     "title": "<Project name> release notes",
     "entries": [
       { "type": "fixed", "title": "The export keeps the column order", "description": "The CSV export writes the columns in the order that the table shows.", "commits": ["<full SHA>"] }
     ]
   }
   ```

   - Give `title` on the first run only. Later runs keep the recorded title.
   - The `entries` array can be empty. The cursor then moves past commits that are not for this audience.
10. Add the entries:

    ```sh
    node "<script>" append --kind project --json "<json>" --html "<html>" --draft "<draft>" --base "<base>" --through "<through>" --repo "<repo>" [--ref "<ref>"]
    ```

    - Copy `base` and `through` exactly from the collect output. Give the same `--ref` as step 5 on the first run.
    - If the script refuses the draft, correct the draft as the error tells you. Then run the command again.
    - If the error says that the JSON file changed after collect, go back to step 5.
11. If `remaining` was more than 0, do steps 5 to 10 again.
12. Delete the draft file. Tell the user the number of added entries, the two file paths, and the types of commits that you left out.

## STE rules for the text

- Use approved ASD-STE100 words. Give each word one meaning.
- Use the active voice. Use the present tense for the new behavior.
- Write 25 words or fewer in each sentence. The script refuses a longer sentence or title.
- Write one topic in each sentence.
- Use "the" or "a" before a noun.
- Do not use a noun cluster of more than three words.
- Do not use slang, jargon, or an idiom. Explain a technical term the first time, or do not use it.
- Keep product names, feature names, and user interface labels as they are.

## Facts about the files

- The JSON file is the source of truth. The script writes the full HTML page again from it on each run.
- The HTML page is one offline file. It groups the changes by date, newest first, and has `From` and `To` date filters.
- The JSON file records the last processed commit. The next run reads only the commits after it.
- The script refuses a commit that an entry already lists, a commit outside the collected range, and an HTML file that it did not write.
- If the HTML page is out of date or missing, run `node "<script>" render --kind project --json "<json>" --html "<html>"`.
- A `<json>.lock` file stops two runs at the same time. If a run stopped, the lock file stays. Make sure that no other run is active, then tell the user to remove it.
- If the reference no longer contains the recorded commit, the history changed. Tell the user. Do not delete the JSON file to continue.
