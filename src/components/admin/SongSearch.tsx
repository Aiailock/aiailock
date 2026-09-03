import { useState, type FormEvent } from 'react';
import { Check, ExternalLink, Music2, Search } from 'lucide-react';
import { searchSongs, type SongSearchResult } from '@/lib/songSearch';

export default function SongSearch({ value, onChange, metadataOnly = false }: { value: SongSearchResult | null; onChange: (song: SongSearchResult) => void; metadataOnly?: boolean }) {
  const [query, setQuery] = useState(value ? `${value.artist} ${value.title}` : '');
  const [results, setResults] = useState<SongSearchResult[]>(value ? [value] : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const songs = await searchSongs(query);
      setResults(songs);
      if (songs.length === 0) setError('Ничего не найдено. Попробуй написать исполнителя и название иначе.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось найти музыку.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="rounded-2xl border border-burgundy/10 bg-[#FBF8F5] p-3">
    <form onSubmit={(event) => void submit(event)} className="flex gap-2">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Название песни или исполнитель</span>
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-burgundy/40" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Исполнитель или название песни" className="w-full rounded-xl border py-3 pl-9 pr-3 text-sm" />
      </label>
      <button type="submit" disabled={loading} className="shrink-0 rounded-xl bg-burgundy px-4 py-3 text-xs text-white disabled:opacity-45">{loading ? 'Ищу…' : 'Найти'}</button>
    </form>
    <p className="mt-2 text-[10px] leading-relaxed opacity-45">{metadataOnly ? 'Поиск нужен только для названия, исполнителя и обложки. Короткий фрагмент ниже помогает узнать песню, но в историю не сохраняется.' : 'Поиск без API-ключа через каталог iTunes. Короткий фрагмент ниже нужен только для выбора песни.'}</p>
    {error && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{error}</div>}
    {results.length > 0 && <div className="mt-3 max-h-[410px] space-y-2 overflow-y-auto pr-1">
      {results.map((song) => {
        const selected = value?.id === song.id;
        return <div key={song.id} className={`rounded-2xl border p-2.5 transition ${selected ? 'border-burgundy bg-[#F6EFE0] shadow-sm' : 'border-black/5 bg-white/75'}`}>
          <div className="flex min-w-0 gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-burgundy to-[#171016] text-gold">
              {song.artworkUrl ? <img src={song.artworkUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Music2 size={22} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-burgundy">{song.title}</div>
              <div className="truncate text-xs opacity-60">{song.artist}</div>
              <div className="mt-1 truncate text-[10px] opacity-40">{song.album || song.genre}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onChange(song)} className={`rounded-lg px-3 py-1.5 text-[11px] ${selected ? 'bg-emerald-700 text-white' : 'bg-burgundy text-white'}`}>{selected ? <><Check size={12} className="mr-1 inline"/>Выбрано</> : 'Выбрать'}</button>
                {song.sourceUrl && <a href={song.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-burgundy/55 underline">Каталог <ExternalLink size={10} className="inline"/></a>}
              </div>
            </div>
          </div>
          <audio controls preload="none" src={song.previewUrl} className="mt-2 h-8 w-full" />
        </div>;
      })}
    </div>}
  </div>;
}
