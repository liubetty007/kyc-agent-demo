import Anthropic from '@anthropic-ai/sdk';

export function hasClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function optionallyPolishText(prompt: string, fallback: string): Promise<string> {
  if (!hasClaudeConfigured()) return fallback;
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content.find((block) => block.type === 'text')?.text ?? fallback;
}
