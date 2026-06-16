import Anthropic from '@anthropic-ai/sdk';

export function hasClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function optionallyPolishText(prompt: string, fallback: string): Promise<string> {
  if (!hasClaudeConfigured()) return fallback;
  const client = new Anthropic();
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content.find((block) => block.type === 'text')?.text ?? fallback;
}

export async function getClaudeJson<T>(prompt: string, fallback: T): Promise<T> {
  if (!hasClaudeConfigured()) return fallback;
  const client = new Anthropic();
  try {
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
