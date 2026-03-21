Deploy all current changes to GitHub (which auto-deploys to Vercel).

## Steps

1. Run `git status` to see what has changed.
2. Run `git diff HEAD` (and `git diff --cached`) to understand what was changed — read through it carefully.
3. Based on what you see, write a clear, concise commit message in this format:
   - First line: short summary (max 72 chars), e.g. `feat: add accordion onboarding flow`
   - If there are multiple distinct changes, add bullet points after a blank line
4. Stage all changes: `git add -A`
5. Commit with the message you wrote: `git commit -m "your message"`
6. Push to origin: `git push`
7. Confirm success and tell the user the changes are live (Vercel will deploy automatically from GitHub).

## Commit message style

- Use prefixes: `feat:` (new feature), `fix:` (bug fix), `style:` (UI/CSS), `refactor:` (code cleanup), `chore:` (config/deps)
- Be specific: mention what changed, not just "updated files"
- Examples:
  - `feat: replace wizard onboarding with accordion checklist`
  - `fix: remove back buttons from onboarding step components`
  - `style: update sidebar active state colors`

## Important

- Never ask for confirmation — just do it.
- If the push fails because the branch is behind, run `git pull --rebase` first, then push again.
- If there is nothing to commit (`git status` shows clean), tell the user and stop.
