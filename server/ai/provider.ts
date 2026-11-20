import type {
  AssistantStructuredResponse,
  EnvironmentSnapshot,
  FamilyProfile,
  LanguageCode,
} from '../../src/shared/types.ts';

export interface AssistantQueryInput {
  question: string;
  thinkingMode: 'fast' | 'deep';
  language: LanguageCode;
  environment: EnvironmentSnapshot;
  profile: FamilyProfile;
}

export interface AIProvider {
  readonly name: string;
  generateAdvice(input: AssistantQueryInput): Promise<AssistantStructuredResponse>;
}
