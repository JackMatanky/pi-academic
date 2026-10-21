import { strToU8, zipSync } from "fflate";

/**
 * Builds a `.docx` shaped like one saved by Word, not Pandoc: separator
 * footnotes, `FootnoteReference`/`FootnoteText` styles, revision ids, and runs
 * split by spell-check `proofErr` markers. Each footnote and paragraph is a
 * list of text pieces, and every piece becomes its own run, so a phrase can be
 * split mid-word the way Word splits it.
 *
 * @param paragraphs - Body paragraphs as text pieces; a `^n` piece is a
 *   reference to footnote n.
 * @param footnotes - Footnote texts as pieces, in order (footnote 1 first).
 *
 * @returns The `.docx` bytes.
 */
export function wordDocx(
  paragraphs: string[][],
  footnotes: string[][],
): Uint8Array {
  const esc = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  const run = (text: string) =>
    `<w:r w:rsidR="00A1B2C3"><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

  const proof =
    '<w:proofErr w:type="spellStart"/><w:proofErr w:type="spellEnd"/>';

  const pieces = (list: string[]) =>
    list
      .map((piece) => {
        const ref = /^\^(\d+)$/.exec(piece)?.[1];

        return ref
          ? `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${ref}"/></w:r>`
          : run(piece);
      })
      .join(proof);

  const ns =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

  const separator = (type: string, id: number, mark: string) =>
    `<w:footnote w:type="${type}" w:id="${id}"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><${mark}/></w:r></w:p></w:footnote>`;

  const note = (list: string[], id: number) =>
    `<w:footnote w:id="${id}"><w:p w:rsidR="00A1B2C3"><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>${run(" ")}${pieces(list)}</w:p></w:footnote>`;

  const style = (id: string, type: string, name: string) =>
    `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`;

  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>`,
    ),
    "word/settings.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${ns}><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr></w:settings>`,
    ),
    "word/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${ns}>${style("Normal", "paragraph", "Normal")}${style("FootnoteText", "paragraph", "footnote text")}${style("FootnoteReference", "character", "footnote reference")}</w:styles>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${paragraphs
        .map((list) => `<w:p w:rsidR="00A1B2C3">${pieces(list)}</w:p>`)
        .join("")}</w:body></w:document>`,
    ),
    "word/footnotes.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${ns}>${separator("separator", -1, "w:separator")}${separator("continuationSeparator", 0, "w:continuationSeparator")}${footnotes
        .map((list, index) => note(list, index + 1))
        .join("")}</w:footnotes>`,
    ),
  });
}
