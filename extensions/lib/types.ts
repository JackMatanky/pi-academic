import type { Static } from "typebox";

import { Type } from "typebox";

import { JsonObjectSchema } from "./schema.js";

const IntegrationScopeSchema = Type.Object({
  id: Type.Optional(Type.String()),
  key: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
});

/**
 * Optional project-specific integration scope saved in the profile.
 */
export type IntegrationScope = Static<typeof IntegrationScopeSchema>;

/**
 * Schema for user-configured integration metadata from the profile.
 */
export const ToolConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  path: Type.Optional(Type.String()),
  mode: Type.Optional(Type.String()),
  collection: Type.Optional(IntegrationScopeSchema),
  notebook: Type.Optional(IntegrationScopeSchema),
});

/**
 * User-configured integration metadata from the profile.
 */
export type ToolConfig = Static<typeof ToolConfigSchema>;

const OutputFormatPreferencesSchema = Type.Object({
  stylePackage: Type.Optional(Type.String()),
  font: Type.Optional(Type.String()),
  bodySize: Type.Optional(Type.Number()),
  titleSize: Type.Optional(Type.Number()),
  lineSpacing: Type.Optional(Type.Number()),
  margins: Type.Optional(Type.String()),
  rtl: Type.Optional(Type.Boolean()),
});

/**
 * Schema for a parsed `.academic-writer/profile.md`.
 *
 * The style fingerprint and article structure are produced by agents and read
 * back verbatim, so they are kept as JSON objects rather than a fixed shape.
 */
export const ProfileDataSchema = Type.Object({
  fieldOfStudy: Type.Optional(Type.String()),
  citationStyle: Type.Optional(Type.String()),
  targetLanguage: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  createdAt: Type.Optional(Type.String()),
  abstractLanguages: Type.Optional(Type.Array(Type.String())),
  analyzedArticles: Type.Optional(Type.Array(Type.String())),
  tools: Type.Optional(Type.Record(Type.String(), ToolConfigSchema)),
  outputFormatPreferences: Type.Optional(OutputFormatPreferencesSchema),
  styleFingerprint: Type.Optional(JsonObjectSchema),
  articleStructure: Type.Optional(JsonObjectSchema),
  sources: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String(),
        title: Type.Optional(Type.String()),
        type: Type.Optional(Type.String()),
      }),
    ),
  ),
});

/**
 * Parsed `.academic-writer/profile.md` data used by extensions and hooks.
 */
export type ProfileData = Static<typeof ProfileDataSchema>;
