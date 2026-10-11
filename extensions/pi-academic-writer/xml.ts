import type { Document, Element, Node } from "@xmldom/xmldom";

/** xmldom types `ownerDocument` as nullable; every node we touch comes from a parsed document. */
export function ownerOf(node: Node): Document {
  if (!node.ownerDocument)
    throw new Error("XML node is not attached to a document");

  return node.ownerDocument;
}

export function rootOf(doc: Document): Element {
  if (!doc.documentElement) throw new Error("XML document has no root element");

  return doc.documentElement;
}

/** `appendChild` that keeps the child's own type, so it can be configured afterwards. */
export function append<T extends Node>(parent: Node, child: T): T {
  parent.appendChild(child);

  return child;
}
