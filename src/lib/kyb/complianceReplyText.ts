const CHINESE_WROTE_PATTERN = /(?:^|\n)[^\n]*于[^\n]{0,80}写道：?\s*\n/i;
const ENGLISH_WROTE_PATTERN = /(?:^|\n)On .+ wrote:\s*\n/i;
const ORIGINAL_MESSAGE_PATTERN = /(?:^|\n)-{2,}\s*Original Message\s*-{2,}\n/i;

export function extractNewReplyText(body: string): string {
  if (!body?.trim()) return '';

  let text = body.replace(/\r\n/g, '\n').trim();

  for (const pattern of [CHINESE_WROTE_PATTERN, ENGLISH_WROTE_PATTERN, ORIGINAL_MESSAGE_PATTERN]) {
    const match = text.match(pattern);
    if (match?.index !== undefined) {
      const before = text.slice(0, match.index).trim();
      if (before) text = before;
      else if (match.index === 0) return '';
    }
  }

  const lines: string[] = [];
  for (const line of text.split('\n')) {
    if (/^\s*>/.test(line)) break;
    if (/^From:\s/i.test(line) && lines.length > 0) break;
    lines.push(line);
  }

  return lines.join('\n').trim();
}

export function complianceReplyExcerpt(body: string, maxLen = 160): string {
  const text = extractNewReplyText(body);
  if (!text) {
    if (body.trim()) return '（无新增回复正文，请打开查看详情）';
    return '';
  }
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trim()}…`;
}
