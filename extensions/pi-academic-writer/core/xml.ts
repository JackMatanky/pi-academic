import type { Document, Element, Node } from "@xmldom/xmldom";

/**
 * Returns the owner Document of an XML node, throwing if unattached.
 *
 * @param node - XML DOM node to inspect.
 *
 * @returns Attached owner Document.
 * @throws When node is not attached to a document.
 */
export function ownerOf(node: Node): Document {
  if (!node.ownerDocument)
    throw new Error("XML node is not attached to a document");

  return node.ownerDocument;
}

/**
 * Returns the root element of an XML document, throwing if absent.
 *
 * @param doc - XML Document instance.
 *
 * @returns Root Element of the document.
 * @throws When document has no root element.
 */
export function rootOf(doc: Document): Element {
  if (!doc.documentElement) throw new Error("XML document has no root element");

  return doc.documentElement;
}

/**
 * Appends a child node to a parent while retaining the child's concrete type.
 *
 * @param parent - DOM node to receive child.
 * @param child - Child node to append.
 *
 * @returns Appended child node preserving its type.
 */
export function append<T extends Node>(parent: Node, child: T): T {
  parent.appendChild(child);

  return child;
}

/**
 * Narrows an xmldom node to an element.
 *
 * @param node - Node to test.
 *
 * @returns True if node is an Element (nodeType === 1).
 */
export function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

/**
 * Returns the descendant elements of parent matching namespace and local name.
 *
 * @param parent - Parent Document or Element to search within.
 * @param ns - Namespace URI string.
 * @param local - Element local name.
 *
 * @returns Array of matching Element nodes.
 */
export function elementsByTagNameNS(
  parent: Document | Element,
  ns: string,
  local: string,
): Element[] {
  const found = parent.getElementsByTagNameNS(ns, local);
  const elements: Element[] = [];

  for (let index = 0; index < found.length; index++) {
    const node = found.item(index);

    if (node && isElement(node)) elements.push(node);
  }

  return elements;
}
