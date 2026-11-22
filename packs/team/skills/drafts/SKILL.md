---
name: drafts
description: Write a GitHub issue, comment, review or pull request description as a local draft in .bees/drafts/ for a human to approve, instead of posting it. Use whenever an agent wants to post anything to GitHub.
---

# Drafts: write, then a human posts

Agents never post to GitHub directly. They write a draft; a human reads it, edits it if needed, and publishes it with `/post`.

## Write a draft

1. Create `.bees/drafts/<YYYY-MM-DD>-<short-slug>.md`. The folder is gitignored, so drafts stay on this machine.
2. Start it with this front matter:

   ```yaml
   ---
   kind: issue            # issue | comment | review | pr
   target: "#42"          # issue or PR number for comment/review; branch name for pr; omit for a new issue
   title: "Export fails on empty reports"   # issue and pr only
   author: Kenji, Reviewer
   status: draft          # draft → posted
   ---
   ```

3. Write the body in GitHub Markdown, exactly as it should appear.
4. End the body with the signature on its own line: `— <Name>, <Role> · bees agent 🐝`.
5. Tell the human the draft's path and a one-line summary, then stop. Don't post it.

## Rules

- One draft per thing to post. Update the same file if you're asked for changes.
- No secrets, tokens, internal URLs or personal data in drafts.
- Quote code with file paths and line numbers so the reader can check it.
- If a draft depends on something unverified, say so in the draft.
