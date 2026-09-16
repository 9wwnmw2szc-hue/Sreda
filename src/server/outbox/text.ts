/** Plain text only. Preserve content and avoid splitting UTF-16 surrogate pairs. */
export function messageChunks(text: string, max = 4000): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + max, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
