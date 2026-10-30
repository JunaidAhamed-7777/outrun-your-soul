/** Tiny DOM helpers shared by overlay modules. */
export type Attrs = Record<string, string>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

/** Wrap static, author-controlled SVG markup (never user or save data). */
export function iconSpan(svg: string, className = ''): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  if (!className) span.style.display = 'contents';
  span.innerHTML = svg;
  return span;
}

export function button(className: string, label: string | (Node | string)[], attrs: Attrs = {}): HTMLButtonElement {
  return el('button', className, { type: 'button', ...attrs }, typeof label === 'string' ? [label] : label);
}
