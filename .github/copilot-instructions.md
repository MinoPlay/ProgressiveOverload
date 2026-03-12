# Copilot Instructions

## Change Philosophy

- **Do exactly what is asked, nothing more.** If the request is "change A to B", change A to B and stop. Do not fix nearby issues, add improvements, or make any other edits.
- **Minimal changes only.** Apply the smallest diff that satisfies the request. Do not refactor, reorganize, or "improve" code that is unrelated to the task.
- **Do not touch unrelated code.** If a change can be scoped to one file, keep it there. Do not cascade edits into files that are not part of the request.
- **No code duplication.** Before adding new code, check if equivalent logic already exists and reuse it. Extract shared logic into helpers only when it eliminates real duplication, not speculatively.
- **No dead code.** Do not leave behind unused variables, functions, imports, or commented-out code. If something is replaced, remove the old version.
- **Preserve existing style.** Match the formatting, naming, and patterns of the surrounding code exactly.

## UI Guidelines

- **Mobile-first.** All UI changes must work well on small screens (320px+). Use responsive units, flexible layouts, and avoid fixed widths that break on mobile.
- **Compact.** Keep UI dense and efficient. Avoid excessive padding, large empty spaces, or verbose labels. Prefer concise text and tight spacing.

## Git Workflow

After completing each prompt, offer a ready-to-run git command block:

```
git add .<only the files that were changed>
git commit -m "<concise description of what changed>"

```

- The commit message must accurately describe the change (e.g., `"Add rest timer to session board"`, `"Fix PR calculation for bodyweight exercises"`).
- Use imperative mood for commit messages (e.g., "Add", "Fix", "Remove", not "Added", "Fixed", "Removed").
- If the change spans multiple concerns, suggest separate commits instead.

## Code Conventions

- **Indentation:** 4 spaces (no tabs).
- **Strings:** Single quotes (`'...'`).
- **Semicolons:** Always.
- **Naming:** `camelCase` for functions, variables, and object properties. `PascalCase` for singleton module objects (e.g., `Storage`, `Auth`, `Exercises`).
- **Modules (browser JS):** ES Modules — `import` / `export`. Each file in `js/` is a self-contained module.
- **Modules (server):** CommonJS `require` in `server.js` only.
- **Patterns:** Object-literal singletons (`export const ModuleName = { ... }`), not classes.
- **Documentation:** JSDoc comments (`@param`, `@returns`) on public-facing methods.
- **Framework:** Vanilla JavaScript (ES6+). No frameworks. Chart.js is the only library.
- **File headers:** Each module file starts with a comment describing its purpose.

## Project Structure

```
js/          → Browser ES modules (app.js is the entry point)
css/         → Stylesheets (styles.css imports layout.css and components.css)
data/        → Static JSON data (exercises list, dev seed data)
assets/      → Static assets
server.js    → Node.js dev server (CommonJS, port 3000)
```
