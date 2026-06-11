/** 客户端表格过滤：空格分隔的每个词都需在字段合集中匹配 */
export function matchesAdminFilter(
  query: string,
  fields: Array<string | null | undefined>,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = fields
    .filter((v): v is string => Boolean(v?.trim()))
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}
