import { describe, it, expect } from 'vitest';
import { selectRecentPhotos } from '../app/media-utils';

describe('selectRecentPhotos (Mídia Recente)', () => {
  const photos = [
    { id: 'p1', date: '2026-01-10', created_at: '2026-01-10T10:00:00+00:00' },
    { id: 'p3', date: '2026-09-01', created_at: '2026-09-01T08:00:00+00:00' },
    { id: 'p2', date: '2026-05-05', created_at: '2026-05-05T09:00:00+00:00' },
    { id: 'p4', date: '2026-09-01', created_at: '2026-09-01T09:30:00+00:00' },
  ];

  it('retorna as 2 mais recentes (data desc, depois created_at desc)', () => {
    expect(selectRecentPhotos(photos).map(p => p.id)).toEqual(['p4', 'p3']);
  });

  it('independe da ordem de entrada (ex.: lista decrescente da API)', () => {
    const desc = [...photos].sort((a, b) => b.date.localeCompare(a.date));
    expect(selectRecentPhotos(desc).map(p => p.id)).toEqual(['p4', 'p3']);
    expect(selectRecentPhotos([...desc].reverse()).map(p => p.id)).toEqual(['p4', 'p3']);
  });

  it('não altera o array original', () => {
    const before = photos.map(p => p.id);
    selectRecentPhotos(photos);
    expect(photos.map(p => p.id)).toEqual(before);
  });

  it('menos de 2 fotos, vazio, null e sem created_at', () => {
    expect(selectRecentPhotos([photos[0]]).map(p => p.id)).toEqual(['p1']);
    expect(selectRecentPhotos([])).toEqual([]);
    expect(selectRecentPhotos(null)).toEqual([]);
    expect(selectRecentPhotos([{ id: 'a', date: '2026-01-01' }, { id: 'b', date: '2026-02-01' }]).map(p => p.id)).toEqual(['b', 'a']);
  });

  it('limite configurável', () => {
    expect(selectRecentPhotos(photos, 3).map(p => p.id)).toEqual(['p4', 'p3', 'p2']);
  });
});
