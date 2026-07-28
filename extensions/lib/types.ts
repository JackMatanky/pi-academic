/** Parsed `.academic-helper/profile.md` data used by extensions and lifecycle hooks. */
export interface ProfileData {
  fieldOfStudy?: string;
  citationStyle?: string;
  targetLanguage?: string;
  styleFingerprint?: StyleFingerprint;
  tools?: Record<string, ToolConfig>;
  articleStructure?: ArticleStructure;
  outputFormatPreferences?: OutputFormatPreferences;
  sources?: Array<{ id: string; title?: string; type?: string }>;
  abstractLanguages?: string[];
  analyzedArticles?: string[];
}

/** User-configured integration metadata from the profile. */
export interface ToolConfig {
  enabled: boolean;
  path?: string;
  mode?: string;
}

/** Structured author voice profile mined from past articles. */
export interface StyleFingerprint {
  sentenceLevel?: SentenceLevel;
  vocabularyAndRegister?: VocabularyAndRegister;
  paragraphStructure?: ParagraphStructureConfig;
  toneAndVoice?: ToneAndVoice;
  transitions?: Transitions;
  citations?: Citations;
  rhetoricalPatterns?: RhetoricalPatterns;
  representativeExcerpts?: string[];
  // Legacy flat format fields
  averageSentenceLength?: string;
  vocabularyComplexity?: string;
  passiveVoiceFrequency?: string;
  paragraphStructure_legacy?: string;
  citationDensity?: string;
  toneDescriptors?: string[];
  preferredTransitions?: string[];
  sampleExcerpts?: string[];
}

/** Sentence-level voice characteristics. */
interface SentenceLevel {
  averageLength?: string;
  structureVariety?: string;
  commonOpeners?: string[];
  passiveVoice?: string;
}

/** Vocabulary and register preferences. */
interface VocabularyAndRegister {
  complexity?: string;
  registerLevel?: string;
  firstPersonUsage?: string;
  hebrewConventions?: string;
}

/** Paragraph-level structure and evidence handling. */
interface ParagraphStructureConfig {
  pattern?: string;
  argumentProgression?: string;
  evidenceIntroduction?: string;
  evidenceAnalysis?: string;
}

/** Tone, stance, and hedging preferences. */
interface ToneAndVoice {
  descriptors?: string[];
  authorStance?: string;
  hedgingPatterns?: string[];
}

/** Preferred transition phrases grouped by role. */
interface Transitions {
  preferred?: Record<string, string[]>;
}

/** Citation density and integration preferences. */
interface Citations {
  integrationStyle?: string;
  density?: string;
  footnotesPerParagraph?: string;
  quoteLengthPreference?: string;
}

/** Common rhetorical moves in the researcher's writing. */
interface RhetoricalPatterns {
  common?: string[];
  emphasisTechniques?: string[];
}

/** Preferred article-level structure. */
interface ArticleStructure {
  sections?: string[];
  introPattern?: string;
  conclusionPattern?: string;
}

/** Default document formatting preferences. */
interface OutputFormatPreferences {
  font?: string;
  bodySize?: number;
  titleSize?: number;
  lineSpacing?: number;
  margins?: string;
  rtl?: boolean;
}
