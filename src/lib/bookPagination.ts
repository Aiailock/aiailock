export function splitBookText(value: string, limit = 300): string[] {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= limit) return [normalized];
  const pages: string[] = [];
  let rest = normalized;
  while (rest.length > limit) {
    const pageWindow = rest.slice(0, limit + 1);
    const floor = Math.floor(limit * 0.58);
    const candidates = [
      pageWindow.lastIndexOf('\n\n'),
      pageWindow.lastIndexOf('\n'),
      Math.max(pageWindow.lastIndexOf('. '), pageWindow.lastIndexOf('! '), pageWindow.lastIndexOf('? ')),
      pageWindow.lastIndexOf(' '),
    ];
    const cut = candidates.find((candidate) => candidate >= floor) ?? limit;
    const punctuation = /[.!?]/.test(rest[cut] ?? '') ? 1 : 0;
    pages.push(rest.slice(0, cut + punctuation).trim());
    rest = rest.slice(cut + (rest[cut] === ' ' || rest[cut] === '\n' ? 1 : punctuation)).trim();
  }
  if (rest) pages.push(rest);
  return pages.filter(Boolean);
}
