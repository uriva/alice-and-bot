Keep comments to a minimum. Be concise, use functional programming style. Put
css and design in module level constants. Use regular naming for constants, e.g.
likeThis. Prefer putting logic outside the components, so they have relatively
small bodies, use currying if needed.

When you make UI changes, make sure you design for both light and dark mode.

Avoid using `as` for type assertions.

Avoid commenting. Instead make the code self-explanatory or refactor into smaller
functions.

Prefer destructuring in the signature of functions, e.g. `function f({a, b})`
instead of `function f(x)` and then `x.a`, `x.b`.