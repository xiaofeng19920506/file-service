import { Converter } from 'opencc-js';
const CJK_RE = /[\u4e00-\u9fff]/;
let toTraditional = null;
let toSimplified = null;
function ensureConverters() {
    if (!toTraditional) {
        toTraditional = Converter({ from: 'cn', to: 'tw' });
        toSimplified = Converter({ from: 'tw', to: 'cn' });
    }
}
/** Expand a user query with simplified/traditional Chinese variants for search. */
export function expandSearchQuery(query) {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed)
        return [];
    const terms = new Set([trimmed]);
    if (CJK_RE.test(trimmed)) {
        ensureConverters();
        try {
            terms.add(toTraditional(trimmed).toLowerCase());
            terms.add(toSimplified(trimmed).toLowerCase());
        }
        catch {
            // keep original term only
        }
    }
    return [...terms];
}
//# sourceMappingURL=chinese-search.js.map