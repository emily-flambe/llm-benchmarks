export interface LLMRequest {
  prompt: string;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface LLMProvider {
  id: string;
  modelName: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
