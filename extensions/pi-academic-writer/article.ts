import type { JsonValue } from "../lib/schema.js";
import type { Static } from "typebox";

import { Type } from "typebox";

import { isValid, JsonValueSchema, parseWith } from "../lib/schema.js";

const FootnoteSchema = Type.Object({
  after: Type.String(),
  text: Type.String(),
});

/**
 * A paragraph: plain text, or text with footnotes anchored after phrases.
 */
export const ParagraphSchema = Type.Union([
  Type.String(),
  Type.Object({
    text: Type.String(),
    footnotes: Type.Optional(Type.Array(FootnoteSchema)),
  }),
]);

/**
 * A paragraph: plain text, or text with footnotes anchored after phrases.
 */
export type Paragraph = Static<typeof ParagraphSchema>;

/**
 * Formatting options of an article, as in the original generator.
 */
export const ArticleFormatSchema = Type.Object({
  font: Type.Optional(Type.String()),
  bodySize: Type.Optional(Type.Number()),
  titleSize: Type.Optional(Type.Number()),
  headingSize: Type.Optional(Type.Number()),
  lineSpacing: Type.Optional(Type.Number()),
  /**
   * Page margins in inches.
   */
  margins: Type.Optional(Type.Number()),
  isRtl: Type.Optional(Type.Boolean()),
});

/**
 * Formatting options of an article.
 */
export type ArticleFormat = Static<typeof ArticleFormatSchema>;

/**
 * The article payload `academic_writer_generate_docx` turns into a DOCX.
 */
export const ArticleDataSchema = Type.Object({
  title: Type.Optional(Type.String()),
  thesis: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  abstract: Type.Optional(
    Type.Object({
      primary: Type.Optional(Type.String()),
      secondary: Type.Optional(Type.String()),
    }),
  ),
  sections: Type.Array(
    Type.Object({
      title: Type.Optional(Type.String()),
      paragraphs: Type.Array(ParagraphSchema),
    }),
  ),
  totalWords: Type.Optional(Type.Number()),
  format: Type.Optional(ArticleFormatSchema),
});

/**
 * The article payload `academic_writer_generate_docx` turns into a DOCX.
 */
export type ArticleData = Static<typeof ArticleDataSchema>;

const ArticleWithSections = Type.Object({
  sections: Type.Array(JsonValueSchema),
});

const SectionWithParagraphs = Type.Object({
  paragraphs: Type.Array(JsonValueSchema),
});

/**
 * Validates an article payload and names the offending section or paragraph.
 *
 * @param raw - Raw article JSON value.
 *
 * @returns Validated typed article data.
 * @throws When payload or any section/paragraph breaks schema.
 */
export function parseArticle(raw: JsonValue): ArticleData {
  if (!isValid(ArticleWithSections, raw))
    throw new Error("article JSON must be an object with a sections array");

  raw.sections.forEach((section, sectionIndex) => {
    if (!isValid(SectionWithParagraphs, section))
      throw new Error(
        `sections[${sectionIndex}] must be an object with a paragraphs array`,
      );

    section.paragraphs.forEach((paragraph, paragraphIndex) => {
      if (!isValid(ParagraphSchema, paragraph))
        throw new Error(
          `sections[${sectionIndex}].paragraphs[${paragraphIndex}] must be a string or {text, footnotes:[{after, text}]}`,
        );
    });
  });

  return parseWith(ArticleDataSchema, raw, "article");
}

/**
 * A footnote anchored after a phrase of its paragraph.
 */
export interface Footnote {
  after: string;
  text: string;
}

const StringSchema = Type.String();

/**
 * Returns a paragraph's text and footnotes, whichever form it was written in.
 *
 * @param paragraph - Paragraph either as string or structured object.
 *
 * @returns Normalized object with plain text and footnote list.
 */
export function paragraphParts(paragraph: Paragraph): {
  text: string;
  footnotes: Footnote[];
} {
  return isValid(StringSchema, paragraph)
    ? { text: paragraph, footnotes: [] }
    : { text: paragraph.text, footnotes: paragraph.footnotes ?? [] };
}
