export interface SongSearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  previewUrl: string;
  sourceUrl: string;
  genre: string;
  durationMs: number | null;
}

interface ItunesSong {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackViewUrl?: string;
  primaryGenreName?: string;
  trackTimeMillis?: number;
}

function highResolutionArtwork(value: string): string {
  return value.replace(/\/\d+x\d+bb(?:-\d+)?\.(jpg|png)$/i, '/600x600bb.$1');
}

function countryCode(): string {
  const region = navigator.language.split('-')[1]?.toUpperCase();
  return region && /^[A-Z]{2}$/.test(region) ? region : 'KZ';
}

/**
 * Apple documents JSONP for browser-side iTunes Search API calls. Using an
 * explicit submit button keeps us well below the public endpoint rate limit
 * and means the project needs no API key or new Edge Function secret.
 */
export function searchSongs(query: string): Promise<SongSearchResult[]> {
  const term = query.trim();
  if (term.length < 2) return Promise.reject(new Error('Напиши хотя бы две буквы названия или исполнителя.'));

  return new Promise((resolve, reject) => {
    const callbackName = `__storySongSearch_${crypto.randomUUID().replace(/-/g, '')}`;
    const script = document.createElement('script');
    let settled = false;
    const host = window as unknown as Record<string, unknown>;

    const finish = (error?: Error, results: SongSearchResult[] = []) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.remove();
      delete host[callbackName];
      if (error) reject(error); else resolve(results);
    };

    host[callbackName] = (payload: { results?: ItunesSong[] }) => {
      const rows = Array.isArray(payload?.results) ? payload.results : [];
      const results = rows.flatMap((item): SongSearchResult[] => {
        if (!item.previewUrl || !item.trackName || !item.artistName) return [];
        return [{
          id: String(item.trackId ?? item.previewUrl),
          title: item.trackName,
          artist: item.artistName,
          album: item.collectionName ?? '',
          artworkUrl: item.artworkUrl100 ? highResolutionArtwork(item.artworkUrl100) : '',
          previewUrl: item.previewUrl,
          sourceUrl: item.trackViewUrl ?? '',
          genre: item.primaryGenreName ?? '',
          durationMs: typeof item.trackTimeMillis === 'number' ? item.trackTimeMillis : null,
        }];
      });
      finish(undefined, results);
    };

    script.onerror = () => finish(new Error('Поиск музыки сейчас недоступен. Попробуй ещё раз.'));
    const timeout = window.setTimeout(() => finish(new Error('Поиск занял слишком много времени. Попробуй ещё раз.')), 12000);
    const params = new URLSearchParams({
      term,
      country: countryCode(),
      media: 'music',
      entity: 'song',
      limit: '8',
      explicit: 'Yes',
      callback: callbackName,
    });
    script.src = `https://itunes.apple.com/search?${params.toString()}`;
    script.async = true;
    document.body.appendChild(script);
  });
}
