import React, { useState } from 'react';
import { Minus, Square, X, BookOpen, Link as LinkIcon, MagnifyingGlass } from '@phosphor-icons/react';

interface TitlebarProps {
  onOpenMangaById: (id: string) => void;
  onSearchSubmit: (query: string) => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({ onOpenMangaById, onSearchSubmit }) => {
  const [inputVal, setInputVal] = useState('');

  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = inputVal.trim();
      if (!val) return;

      // Check if it's a MangaDex URL: https://mangadex.org/title/{uuid}
      const urlMatch = val.match(/mangadex\.org\/title\/([a-f0-9-]+)/i) || val.match(/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
      if (urlMatch) {
        onOpenMangaById(urlMatch[1]);
        setInputVal('');
      } else {
        onSearchSubmit(val);
      }
    }
  };

  const isMobileDevice =
    typeof window !== 'undefined' &&
    (Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
      /android|iphone|ipad|ipod/i.test(navigator.userAgent));

  return (
    <header className="w-full shrink-0 h-[calc(2.75rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] bg-background-elevated/95 backdrop-blur-md border-b border-background-border flex items-center justify-between px-3 select-none titlebar-drag-region z-30">
      {/* Brand */}
      <div className="flex items-center gap-2 titlebar-no-drag shrink-0">
        <div className="w-5 h-5 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
          <BookOpen weight="bold" className="w-3 h-3 text-primary" />
        </div>
        <span className="text-xs font-bold tracking-widest text-slate-200 uppercase font-sans">
          Z<span className="text-primary font-light">Reader</span>
        </span>
      </div>

      {/* Quick Search / Paste Link Input */}
      <div className="flex-1 max-w-md mx-2 md:mx-4 titlebar-no-drag">
        <div className="relative flex items-center">
          <MagnifyingGlass weight="bold" className="w-3.5 h-3.5 absolute left-2.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar mangá, autor ou link..."
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-8 pl-8 pr-8 text-xs bg-background/80 border border-background-border rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary/60 transition-colors"
          />
          {inputVal.includes('mangadex.org') && (
            <LinkIcon weight="bold" className="w-3 h-3 absolute right-2.5 text-primary pointer-events-none" />
          )}
        </div>
      </div>

      {/* Window Controls (Desktop Only - strictly hidden on mobile/Android even on tablet screens) */}
      {!isMobileDevice && (
        <div className="hidden md:flex items-center gap-1 titlebar-no-drag shrink-0">
          <button
            onClick={handleMinimize}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] rounded-md transition-colors"
            title="Minimizar"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] rounded-md transition-colors"
            title="Maximizar"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-accent-rose rounded-md transition-colors"
            title="Fechar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </header>
  );
};
