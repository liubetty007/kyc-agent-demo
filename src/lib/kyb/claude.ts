import Anthropic from '@anthropic-ai/sdk';

type LlmProvider = 'anthropic' | 'ollama' | 'none';

export function hasClaudeConfigured(): boolean {
  const model = process.env.ANTHROPIC_MODEL?.toLowerCase();
  if (model === 'disabled' || model === 'none' || model === 'off') return false;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function hasOllamaConfigured(): boolean {
  return process.env.LLM_PROVIDER === 'ollama' || Boolean(process.env.OLLAMA_MODEL);
}

export function activeLlmProvider(): LlmProvider {
  const requested = process.env.LLM_PROVIDER?.toLowerCase();
  if (requested === 'ollama') return 'ollama';
  if (requested === 'anthropic' || requested === 'claude') return hasClaudeConfigured() ? 'anthropic' : 'none';
  if (hasClaudeConfigured()) return 'anthropic';
  if (hasOllamaConfigured()) return 'ollama';
  return 'none';
}

export function hasLlmConfigured(): boolean {
  return activeLlmProvider() !== 'none';
}

function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
}

function ollamaModel(): string {
  return process.env.OLLAMA_MODEL || 'qwen2.5:0.5b';
}

async function postOllamaGenerate(prompt: string, format?: 'json'): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OLLAMA_TIMEOUT_MS || 120000));
  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel(),
        prompt,
        stream: false,
        format,
        options: {
          temperature: Number(process.env.OLLAMA_TEMPERATURE || 0.1),
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }
    const data = await response.json() as { response?: string };
    return data.response || '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function optionallyPolishText(prompt: string, fallback: string): Promise<string> {
  const provider = activeLlmProvider();
  if (provider === 'none') return fallback;
  if (provider === 'ollama') {
    try {
      return (await postOllamaGenerate(prompt)).trim() || fallback;
    } catch {
      return fallback;
    }
  }
  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content.find((block) => block.type === 'text')?.text ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getLlmJson<T>(prompt: string, fallback: T): Promise<T> {
  const provider = activeLlmProvider();
  if (provider === 'none') return fallback;
  try {
    if (provider === 'ollama') {
      const text = await postOllamaGenerate(prompt, 'json');
      const json = text.match(/\{[\s\S]*\}/)?.[0] || text;
      return JSON.parse(json) as T;
    }
    const client = new Anthropic();
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content.find((block) => block.type === 'text')?.text || '';
    const json = text.match(/\{[\s\S]*\}/)?.[0] || text;
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export async function getClaudeJson<T>(prompt: string, fallback: T): Promise<T> {
  return getLlmJson(prompt, fallback);
}
