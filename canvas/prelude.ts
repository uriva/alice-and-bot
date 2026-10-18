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

span = (t: string, className: string) => {
  return { tag: "span", attrs: { class: className }, text: t }
}

strong = (t: string, className: string) => {
  return { tag: "strong", attrs: { class: className }, text: t }
}

b = (t: string, className: string) => {
  return { tag: "b", attrs: { class: className }, text: t }
}

em = (t: string, className: string) => {
  return { tag: "em", attrs: { class: className }, text: t }
}

i = (t: string, className: string) => {
  return { tag: "i", attrs: { class: className }, text: t }
}

u = (t: string, className: string) => {
  return { tag: "u", attrs: { class: className }, text: t }
}

small = (t: string, className: string) => {
  return { tag: "small", attrs: { class: className }, text: t }
}

mark = (t: string, className: string) => {
  return { tag: "mark", attrs: { class: className }, text: t }
}

sub = (t: string, className: string) => {
  return { tag: "sub", attrs: { class: className }, text: t }
}

sup = (t: string, className: string) => {
  return { tag: "sup", attrs: { class: className }, text: t }
}

time = (t: string, className: string) => {
  return { tag: "time", attrs: { class: className }, text: t }
}

h1 = (t: string, className: string) => {
  return { tag: "h1", attrs: { class: className }, text: t }
}

h2 = (t: string, className: string) => {
  return { tag: "h2", attrs: { class: className }, text: t }
}

h3 = (t: string, className: string) => {
  return { tag: "h3", attrs: { class: className }, text: t }
}

h4 = (t: string, className: string) => {
  return { tag: "h4", attrs: { class: className }, text: t }
}

h5 = (t: string, className: string) => {
  return { tag: "h5", attrs: { class: className }, text: t }
}

h6 = (t: string, className: string) => {
  return { tag: "h6", attrs: { class: className }, text: t }
}

p = (children, className: string) => {
  return { tag: "p", attrs: { class: className == "" ? "canvas-p" : "canvas-p " + className }, children: [children] }
}

lead = (children, className: string) => {
  return { tag: "p", attrs: { class: className == "" ? "canvas-lead" : "canvas-lead " + className }, children: [children] }
}

div = (children, className: string) => {
  return { tag: "div", attrs: { class: className }, children: children }
}

section = (children, className: string) => {
  return { tag: "section", attrs: { class: className }, children: children }
}

article = (children, className: string) => {
  return { tag: "article", attrs: { class: className }, children: children }
}

header = (children, className: string) => {
  return { tag: "header", attrs: { class: className }, children: children }
}

footer = (children, className: string) => {
  return { tag: "footer", attrs: { class: className }, children: children }
}

nav = (children, className: string) => {
  return { tag: "nav", attrs: { class: className }, children: children }
}

main = (children, className: string) => {
  return { tag: "main", attrs: { class: className }, children: children }
}

aside = (children, className: string) => {
  return { tag: "aside", attrs: { class: className }, children: children }
}

row = (children, className: string) => {
  return { tag: "div", attrs: { class: className == "" ? "canvas-row" : "canvas-row " + className }, children: children }
}

col = (children, className: string) => {
  return { tag: "div", attrs: { class: className == "" ? "canvas-col" : "canvas-col " + className }, children: children }
}

card = (title: string, children, className: string) => {
  return {
    tag: "div",
    attrs: { class: className == "" ? "canvas-card" : "canvas-card " + className },
    children: [
      { tag: "h3", text: title },
      { tag: "div", attrs: { class: "canvas-card-body" }, children: children }
    ]
  }
}

badge = (t: string, tone: string) => {
  return { tag: "span", attrs: { class: "canvas-badge canvas-badge-" + tone }, children: [t] }
}

stat = (label: string, value: string) => {
  return {
    tag: "div",
    attrs: { class: "canvas-stat" },
    children: [
      { tag: "span", attrs: { class: "canvas-stat-label" }, children: [label] },
      { tag: "span", attrs: { class: "canvas-stat-value" }, children: [value] }
    ]
  }
}

ul = (children, className: string) => {
  return { tag: "ul", attrs: { class: className }, children: children }
}

ol = (children, className: string) => {
  return { tag: "ol", attrs: { class: className }, children: children }
}

li = (children, className: string) => {
  return { tag: "li", attrs: { class: className == "" ? "canvas-list-item" : "canvas-list-item " + className }, children: [children] }
}

list = (items: string[], className: string) => {
  return { tag: "ul", attrs: { class: className }, children: map(listItem, items) }
}

listItem = (t: string) => {
  return { tag: "li", attrs: { class: "canvas-list-item" }, children: [t] }
}

table = (children, className: string) => {
  return { tag: "table", attrs: { class: className }, children: children }
}

thead = (children, className: string) => {
  return { tag: "thead", attrs: { class: className }, children: children }
}

tbody = (children, className: string) => {
  return { tag: "tbody", attrs: { class: className }, children: children }
}

tr = (children, className: string) => {
  return { tag: "tr", attrs: { class: className }, children: children }
}

th = (children, className: string) => {
  return { tag: "th", attrs: { class: className }, children: [children] }
}

td = (children, className: string) => {
  return { tag: "td", attrs: { class: className }, children: [children] }
}

dl = (children, className: string) => {
  return { tag: "dl", attrs: { class: className }, children: children }
}

dt = (children, className: string) => {
  return { tag: "dt", attrs: { class: className }, children: [children] }
}

dd = (children, className: string) => {
  return { tag: "dd", attrs: { class: className }, children: [children] }
}

figure = (children, className: string) => {
  return { tag: "figure", attrs: { class: className }, children: children }
}

figcaption = (children, className: string) => {
  return { tag: "figcaption", attrs: { class: className }, children: [children] }
}

blockquote = (children, className: string) => {
  return { tag: "blockquote", attrs: { class: className }, children: [children] }
}

select = (children, className: string) => {
  return { tag: "select", attrs: { class: className }, children: children }
}

option = (children, className: string) => {
  return { tag: "option", attrs: { class: className }, children: [children] }
}

code = (t: string, className: string) => {
  return { tag: "code", attrs: { class: className }, text: t }
}

pre = (t: string, className: string) => {
  return { tag: "pre", attrs: { class: className }, text: t }
}

quote = (t: string, by: string) => {
  return {
    tag: "blockquote",
    attrs: { class: "canvas-quote" },
    children: [
      { tag: "p", attrs: { class: "canvas-p" }, children: [t] },
      { tag: "small", text: by }
    ]
  }
}

button = (label: string, name: string, className: string) => {
  return {
    tag: "button",
    attrs: { class: className == "" ? "canvas-btn" : "canvas-btn " + className, type: "button" },
    on: { click: name == "" ? "click" : name },
    children: [label]
  }
}

submitButton = (label: string, className: string) => {
  return {
    tag: "button",
    attrs: { class: className == "" ? "canvas-btn canvas-btn-primary" : "canvas-btn canvas-btn-primary " + className, type: "submit" },
    children: [label]
  }
}

link = (label: string, href: string, name: string) => {
  return name == ""
    ? { tag: "a", attrs: { class: "canvas-link", href: href }, children: [label] }
    : { tag: "a", attrs: { class: "canvas-link", href: href }, on: { click: name }, children: [label] }
}

a = (label: string, href: string, name: string) => {
  return name == ""
    ? { tag: "a", attrs: { class: "canvas-link", href: href }, children: [label] }
    : { tag: "a", attrs: { class: "canvas-link", href: href }, on: { click: name }, children: [label] }
}

input = (field: string, placeholder: string, value: string) => {
  return { tag: "input", attrs: { class: "canvas-input", name: field, placeholder: placeholder, value: value } }
}

textarea = (field: string, placeholder: string, value: string) => {
  return { tag: "textarea", attrs: { class: "canvas-input", name: field, placeholder: placeholder }, text: value }
}

form = (name: string, children, className: string) => {
  return { tag: "form", attrs: { class: className == "" ? "canvas-form" : "canvas-form " + className }, on: { submit: name == "" ? "submit" : name }, children: children }
}

img = (src: string, alt: string, className: string) => {
  return { tag: "img", attrs: { class: className, src: src, alt: alt } }
}

label = (t: string, field: string) => {
  return { tag: "label", attrs: { class: "canvas-label", for: field }, children: [t] }
}

br = (className: string) => {
  return { tag: "br", attrs: { class: className } }
}

hr = (className: string) => {
  return { tag: "hr", attrs: { class: className } }
}
`;
