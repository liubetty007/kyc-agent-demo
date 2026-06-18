export async function readResponseError(response: Response, fallback = 'Request failed.'): Promise<string> {
  const text = await response.text();
  if (!text) return `${fallback} (HTTP ${response.status})`;
  try {
    const data = JSON.parse(text) as { error?: string; detail?: string | Array<{ msg?: string }> };
    if (data.error) return data.error;
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((item) => item.msg || JSON.stringify(item)).join('; ');
    }
    return text;
  } catch {
    return text;
  }
}
