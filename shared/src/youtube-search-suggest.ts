/** 解析 YouTube/Google 搜索建议接口返回体 */
export function parseYoutubeSearchSuggestBody(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];

  const jsonStart = trimmed.indexOf('[');
  if (jsonStart < 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(jsonStart));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) return [];
  return parsed[1].filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export async function fetchYoutubeSearchSuggestionsRemote(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];

  const url = `https://clients1.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}`;
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; file-service/1.0)',
      Accept: '*/*',
    },
  });
  if (!res.ok) return [];
  const text = await res.text();
  return parseYoutubeSearchSuggestBody(text);
}
