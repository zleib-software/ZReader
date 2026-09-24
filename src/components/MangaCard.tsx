import React, { useState } from 'react';
import { MangaItem, getSmartMangaTitle } from '../types/mangadex';
import { BookOpen } from '@phosphor-icons/react';

interface MangaCardProps {
  manga: MangaItem;
  onClick: () => void;
}

export const MangaCard: React.FC<MangaCardProps> = ({ manga, onClick }) => {
  const [imgLoaded, setImgLoaded] = useState(false);

  const title = getSmartMangaTitle(manga);

  const coverRel = manga.relationships.find(r => r.type === 'cover_art');
  const coverFileName = coverRel?.attributes?.fileName;
  const coverUrl = coverFileName
    ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.256.jpg`
    : null;

  const contentRating = manga.attributes.contentRating;
  const status = manga.attributes.status;

  // Format tags cleanly with dot separator
  const genres = manga.attributes.tags
    ?.filter(t => t.attributes?.group === 'genre' || t.attributes?.name?.en)
    ?.slice(0, 2)
    ?.map(t => t.attributes?.name?.en)
    ?.filter(Boolean) || [];

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer flex flex-col select-none transition-transform duration-200 hover:-translate-y-1"
    >
      {/* Poster Image Container */}
      <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-background-elevated border border-white/[0.07] transition-all duration-300 group-hover:border-white/[0.2]">
        {coverUrl ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 animate-pulse bg-white/[0.03] flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-slate-700" />
              </div>
            )}
            <img
              src={coverUrl}
              alt={title}
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={() => setImgLoaded(true)}
              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                imgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-700 bg-background-elevated">
            <BookOpen className="w-8 h-8" />
          </div>
        )}

        {/* Discreet Status Indicator (Top-Left / Top-Right) */}
        {(status || (contentRating && contentRating !== 'safe')) && (
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            {status ? (
              <span className="text-[9px] font-medium tracking-wide px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-slate-300 border border-white/[0.08] flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    status === 'completed'
                      ? 'bg-primary'
                      : status === 'ongoing'
                      ? 'bg-accent-emerald'
                      : 'bg-slate-400'
                  }`}
                />
                <span>
                  {status === 'completed'
                    ? 'Completo'
                    : status === 'ongoing'
                    ? 'Em curso'
                    : status}
                </span>
              </span>
            ) : <span />}

            {contentRating && contentRating !== 'safe' && (
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm ${
                  contentRating === 'erotica' || contentRating === 'pornographic'
                    ? 'bg-accent-rose/85 text-white'
                    : 'bg-black/70 text-accent-amber border border-accent-amber/30'
                }`}
              >
                {contentRating === 'erotica' || contentRating === 'pornographic' ? '18+' : '16+'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Info directly on page surface */}
      <div className="pt-2.5 pb-1 flex flex-col">
        <h3
          className="text-[13px] font-semibold text-slate-200 line-clamp-2 leading-snug group-hover:text-primary transition-colors"
          title={title}
        >
          {title}
        </h3>

        {genres.length > 0 && (
          <p className="text-[11px] text-slate-400 truncate mt-1">
            {genres.join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
};
