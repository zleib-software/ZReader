import React, { useState, useEffect } from 'react';
import { useSmoothScroll } from '../../hooks/useSmoothScroll';
import { MangaItem } from '../../types/mangadex';
import { MangaCard } from '../../components/MangaCard';
import {
  Fire,
  Clock,
  Sparkle,
  Funnel,
  CaretRight,
  SpinnerGap,
  Check,
  X,
  SlidersHorizontal,
  CaretDown,
  CaretUp
} from '@phosphor-icons/react';

interface BrowseViewProps {
  onSelectManga: (mangaId: string) => void;
  ratingsAllowed: string[];
  searchQuery: string;
  onClearSearch: () => void;
}

export interface TagDefinition {
  label: string;
  tagId: string;
  category: 'genre' | 'theme';
}

export const ALL_TAGS: TagDefinition[] = [
  // Gêneros Principais (UUIDs verificados diretamente na API oficial da MangaDex)
  { label: 'Ação', tagId: '391b0423-d847-456f-aff0-8b0cfc03066b', category: 'genre' },
  { label: 'Aventura', tagId: '87cc87cd-a395-47af-b27a-93258283bbc6', category: 'genre' },
  { label: 'Comédia', tagId: '4d32cc48-9f00-4cca-9b5a-a839f0764984', category: 'genre' },
  { label: 'Romance', tagId: '423e2eae-a7a2-4a8b-ac03-a8351462d71d', category: 'genre' },
  { label: 'Fantasia', tagId: 'cdc58593-87dd-415e-bbc0-2ec27bf404cc', category: 'genre' },
  { label: 'Drama', tagId: 'b9af3a63-f058-46de-a9a0-e0c13906197a', category: 'genre' },
  { label: 'Sci-Fi', tagId: '256c8bd9-4904-4360-bf4f-508a76d67183', category: 'genre' },
  { label: 'Mistério', tagId: 'ee968100-4191-4968-93d3-f82d72be7e46', category: 'genre' },
  { label: 'Slice of Life', tagId: 'e5301a23-ebd9-49dd-a0cb-2add944c7fe9', category: 'genre' },
  { label: 'Terror', tagId: 'cdad7e68-1419-41dd-bdce-27753074a640', category: 'genre' },
  { label: 'Psicológico', tagId: '3b60b75c-a2d7-4860-ab56-05f391bb889c', category: 'genre' },
  { label: 'Esportes', tagId: '69964a64-2f90-4d33-beeb-f3ed2875eb4c', category: 'genre' },
  { label: 'Histórico', tagId: '33771934-028e-4cb3-8744-691e866a923e', category: 'genre' },
  { label: 'Crime', tagId: '5ca48985-9a9d-4bd8-be29-80dc0303db72', category: 'genre' },
  { label: 'Mecha', tagId: '50880a9d-5440-4732-9afb-8f457127e836', category: 'genre' },

  // Temas e Estilos Populares
  { label: 'Isekai', tagId: 'ace04997-f6bd-436e-b261-779182193d3d', category: 'theme' },
  { label: 'Sobrenatural', tagId: 'eabc5b4c-6aff-42f3-b657-3e90cbd00b75', category: 'theme' },
  { label: 'Artes Marciais', tagId: '799c202e-7daa-44eb-9cf7-8a3c0441531e', category: 'theme' },
  { label: 'Escolar', tagId: 'caaa44eb-cd40-4177-b930-79d3ef2afe87', category: 'theme' },
  { label: 'Reencarnação', tagId: '0bc90acb-ccc1-44ca-a34a-b9f3a73259d0', category: 'theme' },
  { label: 'Sobrevivência', tagId: '5fff9cde-849c-4d78-aab0-0d52b2ee1d25', category: 'theme' },
  { label: 'Super-herói', tagId: '7064a261-a137-4d3a-8848-2d385de3a99c', category: 'theme' },
  { label: 'Magia', tagId: 'a1f53773-c69a-4ce5-8cab-fffcd90b1565', category: 'theme' },
  { label: 'Monstros', tagId: '36fd93ea-e8b8-445e-b836-358f02b3d33d', category: 'theme' },
  { label: 'Vilã', tagId: 'd14322ac-4d6f-4e9b-afd9-629d5f4d8a41', category: 'theme' },
  { label: 'Pós-Apocalíptico', tagId: '9467335a-1b83-4497-9231-765337a00b96', category: 'theme' },
  { label: 'Video Games', tagId: '9438db5a-7e2a-4ac0-b39e-e0d95a34b8a8', category: 'theme' }
];

const QUICK_TAGS = ALL_TAGS.slice(0, 8);

export const BrowseView: React.FC<BrowseViewProps> = ({
  onSelectManga,
  ratingsAllowed,
  searchQuery,
  onClearSearch
}) => {
  const [tab, setTab] = useState<'popular' | 'latest'>('popular');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagsMode, setTagsMode] = useState<'AND' | 'OR'>('AND');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [mangaList, setMangaList] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchManga = async (reset = false) => {
    setIsLoading(true);
    const currentOffset = reset ? 0 : offset;

    try {
      let res;
      const order = tab === 'latest' ? 'latestUploadedChapter' : 'followedCount';

      if (searchQuery.trim() || selectedTags.length > 0) {
        res = await window.electronAPI.searchManga(
          searchQuery.trim(),
          24,
          currentOffset,
          ratingsAllowed,
          selectedTags,
          tagsMode,
          searchQuery.trim() ? 'relevance' : order
        );
      } else if (tab === 'popular') {
        res = await window.electronAPI.getPopularManga(24, currentOffset, ratingsAllowed);
      } else {
        res = await window.electronAPI.getLatestManga(24, currentOffset, ratingsAllowed);
      }

      if (res?.data) {
        if (reset) {
          setMangaList(res.data);
          setOffset(24);
        } else {
          setMangaList(prev => [...prev, ...res.data]);
          setOffset(prev => prev + 24);
        }
        setHasMore(res.data.length === 24);
      }
    } catch (err) {
      console.error('Erro ao buscar mangás:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchManga(true);
  }, [tab, selectedTags.join(','), tagsMode, searchQuery, ratingsAllowed.join(',')]);

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const clearAllTags = () => {
    setSelectedTags([]);
  };

  const genres = ALL_TAGS.filter(t => t.category === 'genre');
  const themes = ALL_TAGS.filter(t => t.category === 'theme');

  const scrollRef = useSmoothScroll();

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 w-full overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-5">
      {/* Search Header Banner (if searching) */}
      {searchQuery && (
        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkle weight="bold" className="w-4 h-4 text-primary" />
            <h1 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              {searchQuery ? `Resultados para: "${searchQuery}"` : 'Explorar Títulos'}
            </h1>
          </div>
          {searchQuery && (
            <button
              onClick={onClearSearch}
              className="text-xs text-primary hover:underline font-medium"
            >
              Voltar ao catálogo
            </button>
          )}
        </div>
      )}

      {/* Navigation & Filters Header */}
      <div className="space-y-4 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08]">
          {/* Editorial Main Tabs (Populares / Lançamentos) */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => setTab('popular')}
              className={`pb-2.5 text-xs font-semibold tracking-wide transition-colors relative flex items-center gap-1.5 ${
                tab === 'popular'
                  ? 'text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Fire weight="bold" className={`w-3.5 h-3.5 ${tab === 'popular' ? 'text-primary' : 'text-slate-500'}`} />
              <span>Mais Populares</span>
              {tab === 'popular' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
              )}
            </button>

            <button
              onClick={() => setTab('latest')}
              className={`pb-2.5 text-xs font-semibold tracking-wide transition-colors relative flex items-center gap-1.5 ${
                tab === 'latest'
                  ? 'text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock weight="bold" className={`w-3.5 h-3.5 ${tab === 'latest' ? 'text-primary' : 'text-slate-500'}`} />
              <span>Últimos Lançamentos</span>
              {tab === 'latest' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>

          {/* Filter Actions */}
          <div className="flex items-center gap-2 pb-2">
            {/* Mode selector when multiple tags are active */}
            {selectedTags.length > 1 && (
              <div className="flex items-center bg-white/[0.03] rounded border border-white/[0.08] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setTagsMode('AND')}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    tagsMode === 'AND'
                      ? 'bg-white/[0.08] text-primary font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="O mangá deve conter TODOS os gêneros selecionados simultaneamente"
                >
                  Modo E
                </button>
                <button
                  type="button"
                  onClick={() => setTagsMode('OR')}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    tagsMode === 'OR'
                      ? 'bg-white/[0.08] text-primary font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="O mangá pode conter QUALQUER UM dos gêneros selecionados"
                >
                  Modo OU
                </button>
              </div>
            )}

            {/* Toggle Full Filters Tray Button */}
            <button
              type="button"
              onClick={() => setIsFilterPanelOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                isFilterPanelOpen || selectedTags.length > 0
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-white/[0.02] border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <SlidersHorizontal weight="bold" className="w-3.5 h-3.5" />
              <span>Filtros</span>
              {selectedTags.length > 0 && (
                <span className="text-[10px] text-primary font-bold">({selectedTags.length})</span>
              )}
              {isFilterPanelOpen ? (
                <CaretUp weight="bold" className="w-3 h-3 ml-0.5" />
              ) : (
                <CaretDown weight="bold" className="w-3 h-3 ml-0.5" />
              )}
            </button>

            {/* Quick Clear All */}
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={clearAllTags}
                className="px-2 py-1 text-[11px] text-slate-400 hover:text-accent-rose transition-colors"
                title="Limpar todos os filtros selecionados"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Editorial Genres Textual Strip */}
        <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
          <span className="text-slate-500 font-semibold text-[11px] uppercase tracking-wider mr-1">
            Gêneros:
          </span>
          {QUICK_TAGS.map((g, idx) => {
            const isSelected = selectedTags.includes(g.tagId);
            return (
              <React.Fragment key={g.tagId}>
                <button
                  onClick={() => toggleTag(g.tagId)}
                  className={`transition-colors text-xs ${
                    isSelected
                      ? 'text-primary font-bold underline underline-offset-4'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {g.label}
                </button>
                {idx < QUICK_TAGS.length - 1 && (
                  <span className="text-slate-600 select-none text-[10px]">·</span>
                )}
              </React.Fragment>
            );
          })}
          <span className="text-slate-600 select-none text-[10px]">·</span>
          <button
            onClick={() => setIsFilterPanelOpen(prev => !prev)}
            className="text-slate-400 hover:text-primary transition-colors text-xs font-medium"
          >
            {isFilterPanelOpen ? '− recolher' : '+ todos'}
          </button>
        </div>

        {/* Expanded Categorized Filter Panel */}
        {isFilterPanelOpen && (
          <div className="p-4 rounded-xl bg-background-elevated border border-white/[0.08] space-y-4 animate-in fade-in duration-150">
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
              <div className="flex items-center gap-2">
                <SlidersHorizontal weight="bold" className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-bold text-slate-100">Catálogo de Filtros e Gêneros</span>
              </div>

              {selectedTags.length > 0 && (
                <div className="text-[11px] text-slate-400">
                  <span className="text-primary font-bold">{selectedTags.length}</span> selecionado(s)
                </div>
              )}
            </div>

            {/* Section 1: Gêneros */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Gêneros Principais
              </span>
              <div className="flex flex-wrap gap-1.5">
                {genres.map(tag => {
                  const isSelected = selectedTags.includes(tag.tagId);
                  return (
                    <button
                      key={tag.tagId}
                      onClick={() => toggleTag(tag.tagId)}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-primary/15 text-primary border-primary/40 font-semibold'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.07] text-slate-300 hover:text-white'
                      }`}
                    >
                      {isSelected && <Check weight="bold" className="w-3 h-3" />}
                      <span>{tag.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Temas e Estilos */}
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Temas & Estilos
              </span>
              <div className="flex flex-wrap gap-1.5">
                {themes.map(tag => {
                  const isSelected = selectedTags.includes(tag.tagId);
                  return (
                    <button
                      key={tag.tagId}
                      onClick={() => toggleTag(tag.tagId)}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-primary/15 text-primary border-primary/40 font-semibold'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.07] text-slate-300 hover:text-white'
                      }`}
                    >
                      {isSelected && <Check weight="bold" className="w-3 h-3" />}
                      <span>{tag.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Selected Tags Dismissible Chips */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 animate-in fade-in duration-150">
            <span className="text-[11px] text-slate-500 font-medium mr-1">Filtros ativos:</span>
            {selectedTags.map(tagId => {
              const tagObj = ALL_TAGS.find(t => t.tagId === tagId);
              return (
                <span
                  key={tagId}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/[0.08]"
                >
                  <span>{tagObj?.label || tagId}</span>
                  <button
                    type="button"
                    onClick={() => toggleTag(tagId)}
                    className="text-slate-400 hover:text-accent-rose p-0.5 transition-colors"
                    title={`Remover filtro ${tagObj?.label || ''}`}
                  >
                    <X weight="bold" className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Grid of Manga (5 columns on desktop with editorial breathing room) */}
      {mangaList.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-3 sm:gap-6 pt-2">
          {mangaList.map(manga => (
            <MangaCard
              key={manga.id}
              manga={manga}
              onClick={() => onSelectManga(manga.id)}
            />
          ))}
        </div>
      ) : (
        !isLoading && (
          <div className="py-20 text-center text-slate-500 space-y-2">
            <p className="text-sm font-medium text-slate-300">Nenhum mangá encontrado com os filtros selecionados.</p>
            <p className="text-xs text-slate-500">
              {selectedTags.length > 1 && tagsMode === 'AND'
                ? 'Dica: Você está no modo "E" (todos os filtros). Tente alternar para o modo "OU" ou remover algum filtro.'
                : 'Tente ajustar os termos ou desmarcar alguns filtros para ver mais resultados.'}
            </p>
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={clearAllTags}
                className="mt-3 px-3 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.1] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <X weight="bold" className="w-3.5 h-3.5" />
                Limpar Filtros
              </button>
            )}
          </div>
        )
      )}

      {/* Loading Skeleton / Spinner */}
      {isLoading && (
        <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
          <SpinnerGap weight="bold" className="w-4 h-4 animate-spin text-primary" />
          <span>Carregando mangás da MangaDex...</span>
        </div>
      )}

      {/* Load More Button */}
      {!isLoading && hasMore && mangaList.length > 0 && (
        <div className="pt-6 pb-8 flex justify-center">
          <button
            onClick={() => fetchManga(false)}
            className="px-5 py-2 rounded-md bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white flex items-center gap-2 transition-colors"
          >
            Carregar Mais Mangás
            <CaretRight weight="bold" className="w-3.5 h-3.5 text-primary" />
          </button>
        </div>
      )}
    </div>
  );
};
