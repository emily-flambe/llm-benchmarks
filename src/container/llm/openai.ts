import type { LLMProvider, LLMRequest, LLMResponse } from './types';
import { LLMError } from './types';

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class OpenAIProvider implements LLMProvider {
  constructor(
    public readonly id: string,
    public readonly modelName: string,
    private readonly apiKey: string
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const maxTokens = request.maxTokens ?? 4096;
    const startTime = Date.now();

    // Newer models (o1, o3, gpt-5+) use max_completion_tokens instead of max_tokens
    const usesCompletionTokens =
      this.modelName.startsWith('o1') ||
      this.modelName.startsWith('o3') ||
      this.modelName.startsWith('gpt-5');

    const requestBody: Record<string, unknown> = {
      model: this.modelName,
      messages: [{ role: 'user', content: request.prompt }],
      ...(usesCompletionTokens
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMError(
        `OpenAI API error: ${errorText}`,
        'openai',
        response.status
      );
    }

    const data = (await response.json()) as OpenAIChatResponse;

    if (!data.choices?.[0]?.message?.content) {
      throw new LLMError('OpenAI returned empty response', 'openai');
    }

    return {
      content: data.choices[0].message.content,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      latencyMs,
    };
  }
}
