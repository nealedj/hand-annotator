type Props<K extends keyof HTMLElementTagNameMap> = {
  [P in keyof HTMLElementTagNameMap[K]]?: HTMLElementTagNameMap[K][P] | null;
};

/** Creates an HTML element, assigning properties (not attributes) and appending children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}
