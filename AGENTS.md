# General & Coding Style

- Minimal comments and no JSDoc unless necessary; rely on types and naming.
- Functional style with `gamla` (`pipe`, `map`, `filter`, `empty`, `nonempty`).
  Avoid `class`, `for`/`while` loops, `let`, and `switch`/`case` (prefer `if`
  with early return or ternaries).
- Use arrow functions, destructure in function signatures when clean, and inline
  single-use variables (or extract a well-named module-level function).
- Avoid nested functions; keep logic at the module level (using currying if
  needed) so function and component bodies stay small.
- Avoid `as` type assertions; prefer type guards or inference. Omit inferrable
  type annotations.
- Never make a breaking change without consulting the user first.

# UI & Components

- Put CSS and design constants at the module level (camelCase naming).
- Support both light and dark mode on all UI changes.
- Frontend (landing page, chat UI, docs) uses Lit web components with a History
  API router, built with Vite and deployed to static hosting (separate from Deno
  Deploy).

# Testing & Deployment

- Always write a failing test that reproduces a bug before fixing it.
- Call real APIs in behavioral tests instead of mocking, and avoid `try`/`catch`
  in tests unless explicitly approved.
- Run only affected tests while iterating, then run the full test suite for
  final verification.
- Backend deploys to Cloudflare Workers (`alice-and-bot`,
  `https://api.aliceandbot.com`) and JSR packages publish automatically via CI
  on push to `main`. Never run `deno publish` manually unless explicitly asked.
