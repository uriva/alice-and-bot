Keep comments to a minimum. Be concise, use functional programming style. Put
css and design in module level constants. Use regular naming for constants, e.g.
likeThis. Prefer putting logic outside the components, so they have relatively
small bodies, use currying if needed.

When you make UI changes, make sure you design for both light and dark mode.

Avoid using `as`, prefer type guards or figuring out the type another way.

Don't use commenting or jsdoc unless instructed or in extreme cases. Typings and
names of variables should do most of the documenting.

Prefer destructuring in the signature of functions, e.g. `const f = ({a, b}) =>`
instead of `const f = (x) =>` and then `x.a`, `x.b`.

Avoid duplication by creating small reusable functions or components. Never copy
nontrivial portions of code.

Don't use `case`, prefer an `if` with early return.

Avoid try/catch in tests unless explicitly approved by user.

Avoid nested functions, unless necessary. Consider currying if you need to
inject dependencies.

If a variable is used only once, consider inlining it. If it is too complex,
factor it into a well-named function instead.

Prefer gamla's `empty` than length checks - more readable.

Use arrow functions instead of `function` keyword.

Use a functional style, prefer `map`, `filter`, `pipe` from Gamla instead of
loops and mutable variables. Don't use `class` or `for`/`while` loops unless
absolutely necessary.

When writing tests that verify a behaviour against the api, actually call the
api instead of mocking it. Only mock when given explicit permission by the user.

When running the tests after changes, first run only the tests that were
affected by the changes. Only in your final verification run the full test
suite.

When adding logic, function bodies typically should not enlarge. New logic can
be encapsulated in a new function. Or, one can refactor such that the old
functions are even smaller than before. The added benefit is that there are less
diffs hard to review.

Typically it's better to "solve for the single case" then use functions like
`map` and `filter` to handle the more complex cases. To prevent indent, one can
define the single case and use `map` or similar functions in the call site.

If a type is inferrable from the function, prefer not to annotate it. This is
the common case.
