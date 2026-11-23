---
name: release-notes-stakeholder
description: Write or update release notes for stakeholders (managers, clients, and product owners) from a Git branch. Each change has tags that name the persons who did the work. Writes a JSON file and an HTML page with date and contributor filters, newest first. A second run adds only the new changes. Use when the user asks for a stakeholder update, a progress report, or release notes with contributor names.
---

The bundled script does the Git work, the checks, and the file writes. It also finds the contributors. You write the text of the notes. Never edit the JSON file or the HTML file by hand.

## Requirements

- Node.js 22.13 or later and Git 2.24 or later.
- `<script>` below is `${CLAUDE_PLUGIN_ROOT}/skills/release-notes-stakeholder/scripts/release-notes.cjs`.
- Put each path in quotes in a shell command. Never put free-form user text into a shell command. Pass text in the draft file.

## Procedure

1. Select the output files. The default is `release-notes/stakeholder.json` and `release-notes/stakeholder.html` in the repository root. Use other paths only when the user names them. Use the same paths on each run.
2. If the JSON file exists, it records the source reference. Go to step 4.
3. On the first run, find the source reference:
   1. List the candidates with `git branch -a` and `git tag --sort=-creatordate`.
   2. Ask the user which branch to report. Use the production branch for released work. Use the main development branch for work that is merged but not released. Do not guess.
   3. Ask where the notes start: a tag, a commit, or the full history.
4. If the reference is a remote branch, ask the user before you run `git fetch <remote>`. A fetch makes the reference current.
5. Collect the new commits:

   ```sh
   node "<script>" collect --kind stakeholder --json "<json>" --repo "<repo>" [--ref "<ref>"] [--start "<rev>"]
   ```

   - Give `--ref` on the first run. Give `--start` only on the first run, and only when the user selected a start point.
   - The command writes nothing. It prints `base`, `through`, `remaining`, and the commits, oldest first. Each commit has its `contributors`.
   - If `commits` is empty, tell the user that the branch has no new changes. Stop.
6. Read each commit. Use `git show <sha>` when the subject and the body do not explain the change.
7. Select the changes that have a value for stakeholders. Include features, fault corrections, performance, security, infrastructure, and other work with a business effect. Leave out formatting changes, small refactors, and other work without a visible effect. Put related commits into one entry.
8. Write each entry for stakeholders. Obey the STE rules below.
   - `type`: `added` (a new feature), `changed` (a change to a feature or a system), `fixed` (a fault correction), `removed` (a removed feature), or `security` (a security correction).
   - `title`: one short statement of the result. Use 10 words or fewer.
   - `description`: one to three sentences. Tell what the team did and the effect on the business or the users.
   - `commits`: the full SHAs from step 5 that the entry describes.
   - Do not write contributor names in the text. The script adds the contributor tags from Git. You cannot add, remove, or change a tag.
9. Write the draft to a temporary file outside the repository:

   ```json
   {
     "title": "<Project name> stakeholder release notes",
     "entries": [
       { "type": "changed", "title": "Reports load two times faster", "description": "The team added a cache to the report service. Large reports now open in less than two seconds.", "commits": ["<full SHA>", "<full SHA>"] }
     ]
   }
   ```

   - Give `title` on the first run only. Later runs keep the recorded title.
   - The `entries` array can be empty. The cursor then moves past commits that are not for this audience.
10. Add the entries:

    ```sh
    node "<script>" append --kind stakeholder --json "<json>" --html "<html>" --draft "<draft>" --base "<base>" --through "<through>" --repo "<repo>" [--ref "<ref>"]
    ```

    - Copy `base` and `through` exactly from the collect output. Give the same `--ref` as step 5 on the first run.
    - If the script refuses the draft, correct the draft as the error tells you. Then run the command again.
    - If the error says that the JSON file changed after collect, go back to step 5.
11. If `remaining` was more than 0, do steps 5 to 10 again.
12. Delete the draft file. Tell the user the number of added entries, the two file paths, and the contributors on the new entries.

## Contributor tags

- The script reads the commit author and each `Co-authored-by: Name <email>` trailer.
- For a merge commit, the tags name the authors of the merged commits, not the person who merged them.
- Git applies the `.mailmap` file of the repository to author names. Tell the user to add a `.mailmap` entry when one person has two names.
- Bot accounts and AI co-author trailers also become tags. Tell the user when a tag names a bot.

## STE rules for the text

- Use approved ASD-STE100 words. Give each word one meaning.
- Use the active voice. Name the team or the system that did the action.
- Write 25 words or fewer in each sentence. The script refuses a longer sentence or title.
- Write one topic in each sentence.
- Use "the" or "a" before a noun.
- Do not use a noun cluster of more than three words.
- Do not use slang, jargon, or an idiom. Explain a technical term the first time, or do not use it.
- Keep product names, feature names, and system names as they are.

## Facts about the files

- The JSON file is the source of truth. The script writes the full HTML page again from it on each run.
- The HTML page is one offline file. It groups the changes by date, newest first. It has `From` and `To` date filters and a `Contributor` filter.
- The JSON file records the last processed commit. The next run reads only the commits after it.
- The script refuses a commit that an entry already lists, a commit outside the collected range, and an HTML file that it did not write.
- If the HTML page is out of date or missing, run `node "<script>" render --kind stakeholder --json "<json>" --html "<html>"`.
- A `<json>.lock` file stops two runs at the same time. If a run stopped, the lock file stays. Make sure that no other run is active, then tell the user to remove it.
- If the reference no longer contains the recorded commit, the history changed. Tell the user. Do not delete the JSON file to continue.
