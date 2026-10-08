// Seleção de fotos para o card "Mídia Recente" do perfil.

export interface PhotoLike {
  date: string;
  created_at?: string | null;
}

/**
 * As `limit` fotos MAIS RECENTES: data da foto desc, depois created_at desc.
 * Não depende da ordem em que a API devolve a lista e não altera o array original.
 */
export function selectRecentPhotos<T extends PhotoLike>(photos: readonly T[] | null | undefined, limit = 2): T[] {
  if (!photos?.length) return [];
  return [...photos]
    .sort((a, b) => {
      const byDate = (b.date ?? '').localeCompare(a.date ?? '');
      if (byDate !== 0) return byDate;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    })
    .slice(0, limit);
}
