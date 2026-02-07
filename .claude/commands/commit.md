Commit and push all current changes. Follow these steps exactly:

1. Run `git status` (never use -uall flag) and `git diff` (both staged and unstaged) and `git log --oneline -10` in parallel to understand the current state, all changes, and recent commit style.

2. Review all changes carefully. Do NOT commit files that contain secrets (like .env, credentials.json, API keys, tokens). If such files exist, warn the user and exclude them.

3. **Update CLAUDE.md**: Read the current `CLAUDE.md` file and update it to reflect the latest changes made in this session. This includes:
   - Any new or modified commands, scripts, or dev workflows
   - Architecture changes (new modules, services, components, endpoints)
   - New dependencies or configuration
   - Updated project structure if files/directories were added or removed
   - New or changed key types, models, or schemas
   - Keep the existing format and sections — only add/modify what's relevant to the new changes
   - Do NOT remove existing content that is still accurate

4. **Update README.md**: Read the current `README.md` file and update it to reflect the latest changes. This includes:
   - New features added to the Features section
   - New tech stack entries if new libraries/tools were introduced
   - New prerequisites if any were added
   - Updated installation steps if they changed
   - New or changed available scripts
   - Updated project structure if files/directories were added or removed
   - New API endpoints
   - Keep the existing format and style — only add/modify what's relevant to the new changes
   - Do NOT remove existing content that is still accurate

5. Stage all relevant changed files (including the updated CLAUDE.md and README.md) using `git add` with specific file names (avoid `git add .` or `git add -A`).

6. Write a clear, concise commit message that:
   - Summarizes the nature of the change (feature, fix, refactor, docs, etc.)
   - Focuses on the "why" rather than the "what"
   - Follows the style of recent commits in the repo
   - Is 1-2 sentences maximum
   - Ends with: Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

7. Create the commit using a HEREDOC for the message.

8. Push to the remote repository using `git push`. If there is no upstream branch set, use `git push -u origin <current-branch>`.

9. After pushing, run `git status` and `git log --oneline -3` to confirm everything succeeded, and report the result to the user.

If there are no changes to commit (other than CLAUDE.md and README.md updates), inform the user that there are no code changes, but still offer to update and push the documentation files if they are outdated.
