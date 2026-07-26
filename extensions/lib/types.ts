export interface ProfileData {
  fieldOfStudy: string;
  citationStyle: string;
  targetLanguage: string;
  styleFingerprint?: StyleFingerprint;
  tools?: Record<string, ToolConfig>;
  articleStructure?: ArticleStructure;
  outputFormatPreferences?: OutputFormatPreferences;
  sources?: Array<{ id: string; title?: string; type?: string }>;
  abstractLanguages?: string[];
  analyzedArticles?: string[];
}

export interface ToolConfig {
  enabled: boolean;
  path?: string;
  mode?: "local" | "hybrid";
}

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

interface SentenceLevel {
  averageLength?: string;
  structureVariety?: string;
  commonOpeners?: string[];
  passiveVoice?: string;
}

interface VocabularyAndRegister {
  complexity?: string;
  registerLevel?: string;
  firstPersonUsage?: string;
  hebrewConventions?: string;
}

interface ParagraphStructureConfig {
  pattern?: string;
  argumentProgression?: string;
  evidenceIntroduction?: string;
  evidenceAnalysis?: string;
}

interface ToneAndVoice {
  descriptors?: string[];
  authorStance?: string;
  hedgingPatterns?: string[];
}

interface Transitions {
  preferred?: Record<string, string[]>;
}

interface Citations {
  integrationStyle?: string;
  density?: string;
  footnotesPerParagraph?: string;
  quoteLengthPreference?: string;
}

interface RhetoricalPatterns {
  common?: string[];
  emphasisTechniques?: string[];
}

interface ArticleStructure {
  sections?: string[];
  introPattern?: string;
  conclusionPattern?: string;
}

interface OutputFormatPreferences {
  font?: string;
  bodySize?: number;
  titleSize?: number;
  lineSpacing?: number;
  margins?: string;
  rtl?: boolean;
}
