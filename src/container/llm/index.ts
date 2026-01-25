import type { LLMProvider } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

export type { LLMProvider, LLMRequest, LLMResponse } from './types.js';
export { LLMError } from './types.js';

export interface ProviderConfig {
  id: string;
  provider: string;
  modelName: string;
}

export interface ApiKeys {
  anthropic?: string;
  openai?: string;
  google?: string;
}

export function createLLMProvider(
  config: ProviderConfig,
  apiKeys: ApiKeys
): LLMProvider {
  switch (config.provider) {
    case 'anthropic': {
      if (!apiKeys.anthropic) {
        throw new Error('ANTHROPIC_API_KEY not provided');
      }
      return new AnthropicProvider(config.id, config.modelName, apiKeys.anthropic);
    }
    case 'openai': {
      if (!apiKeys.openai) {
        throw new Error('OPENAI_API_KEY not provided');
      }
      return new OpenAIProvider(config.id, config.modelName, apiKeys.openai);
    }
    // Add more providers here as needed:
    // case 'google': { ... }
    // case 'deepseek': { ... }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
