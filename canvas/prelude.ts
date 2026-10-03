// Prepended to every canvas program. Only the body below is authored by a
// model, so this vocabulary is the entire surface it needs to learn.
//
// Rules this file has to respect:
//   - no default parameters (a function with defaults forces named-arg calls)
//   - no closures, so helpers only take what they use
//   - `emit` is a host-provided op, not defined here
//
// Two limitations of the language shape how a canvas body must be written:
//   - objects can only be read with literal field access, so a form value is
//     `fields.email == null ? "" : fields.email`, never `fields[name]`
//   - an undefined value cannot be passed as an argument, so a possibly-absent
//     value has to be defaulted in the same expression that reads it
//   - every function body must end in a return, so an act that only emits ends
//     with `return emit("...")`; emit returns a value that act may ignore

export const canvasPrelude = `el = (tag: string, attrs, children) => {
  return { tag: tag, attrs: attrs, children: children }
}

action = (tag: string, attrs, event: string, name: string, children) => {
  return { tag: tag, attrs: attrs, on: { click: name }, children: children }
}

span = (t: string) => {
  return { tag: "span", text: t }
}

strong = (t: string) => {
  return { tag: "strong", text: t }
}

em = (t: string) => {
  return { tag: "em", text: t }
}

small = (t: string) => {
  return { tag: "small", text: t }
}

h1 = (t: string) => {
  return { tag: "h1", text: t }
}

h2 = (t: string) => {
  return { tag: "h2", text: t }
}

h3 = (t: string) => {
  return { tag: "h3", text: t }
}

h4 = (t: string) => {
  return { tag: "h4", text: t }
}

p = (t: string) => {
  return el("p", { class: "canvas-p" }, [t])
}

lead = (t: string) => {
  return el("p", { class: "canvas-lead" }, [t])
}

div = (children, className: string) => {
  return el("div", { class: className }, children)
}

section = (children, className: string) => {
  return el("section", { class: className }, children)
}

header = (children, className: string) => {
  return el("header", { class: className }, children)
}

footer = (children, className: string) => {
  return el("footer", { class: className }, children)
}

nav = (children, className: string) => {
  return el("nav", { class: className }, children)
}

main = (children, className: string) => {
  return el("main", { class: className }, children)
}

row = (children, className: string) => {
  return el("div", { class: "canvas-row " + className }, children)
}

col = (children, className: string) => {
  return el("div", { class: "canvas-col " + className }, children)
}

card = (title: string, children, className: string) => {
  return el("div", { class: "canvas-card " + className }, [h3(title), div(children, "canvas-card-body")])
}

badge = (t: string, tone: string) => {
  return el("span", { class: "canvas-badge canvas-badge-" + tone }, [t])
}

stat = (label: string, value: string) => {
  return el("div", { class: "canvas-stat" }, [
    el("span", { class: "canvas-stat-label" }, [label]),
    el("span", { class: "canvas-stat-value" }, [value])
  ])
}

list = (items: string[], className: string) => {
  return el("ul", { class: className }, map(listItem, items))
}

listItem = (t: string) => {
  return el("li", { class: "canvas-list-item" }, [t])
}

code = (t: string) => {
  return { tag: "code", text: t }
}

pre = (t: string) => {
  return { tag: "pre", text: t }
}

quote = (t: string, by: string) => {
  return el("blockquote", { class: "canvas-quote" }, [p(t), small(by)])
}

button = (label: string, name: string) => {
  return action("button", { class: "canvas-btn", type: "button" }, "click", name, [label])
}

submitButton = (label: string, name: string) => {
  return action("button", { class: "canvas-btn canvas-btn-primary", type: "submit" }, "click", name, [label])
}

link = (label: string, href: string, name: string) => {
  return action("a", { class: "canvas-link", href: href }, "click", name, [label])
}

input = (field: string, placeholder: string, value: string) => {
  return { tag: "input", attrs: { class: "canvas-input", name: field, placeholder: placeholder, value: value } }
}

textarea = (field: string, placeholder: string, value: string) => {
  return { tag: "textarea", attrs: { class: "canvas-input", name: field, placeholder: placeholder }, text: value }
}

form = (name: string, children, className: string) => {
  return { tag: "form", attrs: { class: "canvas-form " + className }, on: { submit: name }, children: children }
}

img = (src: string, alt: string, className: string) => {
  return { tag: "img", attrs: { class: className, src: src, alt: alt } }
}

label = (t: string, field: string) => {
  return el("label", { class: "canvas-label", for: field }, [t])
}
`;
