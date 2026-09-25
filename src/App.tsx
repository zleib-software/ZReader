import React, { useState, useEffect } from 'react';
import { Titlebar } from './components/layout/Titlebar';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { BrowseView } from './features/browse/BrowseView';
import { LibraryView } from './features/library/LibraryView';
import { DownloadsView } from './features/downloads/DownloadsView';
import { NotificationsView } from './features/notifications/NotificationsView';
import { SettingsView } from './features/settings/SettingsView';
import { MangaDetailModal } from './features/manga/MangaDetailModal';
import { ReaderModal } from './features/reader/ReaderModal';
import { OnboardingModal } from './features/auth/OnboardingModal';
import { UnlockModal } from './features/auth/UnlockModal';
import { UserProfile } from './types/mangadex';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'browse' | 'library' | 'downloads' | 'notifications' | 'settings'>('browse');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [mangadexConnected, setMangadexConnected] = useState(false);
  const [mangadexUsername, setMangadexUsername] = useState<string | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMangaId, setSelectedMangaId] = useState<string | null>(null);
  const [activeReading, setActiveReading] = useState<{
    chapterId: string;
    mangaTitle: string;
    chapterNumber: string;
    mangaId?: string | null;
  } | null>(null);
  const [ratingsAllowed, setRatingsAllowed] = useState<string[]>(['safe', 'suggestive']);
  const [activeDownloadsCount, setActiveDownloadsCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  // Initial Boot & Profile Check
  useEffect(() => {
    const checkStatus = async () => {
      try {
        // 1. Check Profile
        const userProfile = await window.electronAPI.getProfile();
        if (!userProfile) {
          // First time user -> Show Onboarding
          setIsOnboardingOpen(true);
          setIsUnlocked(false);
        } else {
          setProfile(userProfile);
          // SECURITY: Require password verification on each app launch if hasPassword
          setIsUnlocked(!userProfile.hasPassword);
          setIsOnboardingOpen(false);
        }

        // 2. Check MangaDex Connection
        const mdStatus = await window.electronAPI.getMangaDexStatus();
        setMangadexConnected(mdStatus.connected);
        setMangadexUsername(mdStatus.username);
        if (mdStatus.connected) {
          // Sync library immediately in background
          window.electronAPI.syncLibrary().catch(console.error);
        }

        // 3. Load Settings (Content Ratings)
        const settings = await window.electronAPI.getSettings();
        if (settings?.ratings_allowed) {
          try {
            setRatingsAllowed(JSON.parse(settings.ratings_allowed));
          } catch {}
        }

        // 4. Check active downloads count
        const downloads = await window.electronAPI.getDownloads();
        const active = downloads.filter((d: any) => d.status === 'downloading' || d.status === 'queued').length;
        setActiveDownloadsCount(active);

        // 5. Check unread notifications count
        try {
          const unread = await window.electronAPI.getUnreadNotificationsCount();
          setUnreadNotificationsCount(unread || 0);
        } catch {}
      } catch (err) {
        console.error('Erro na inicialização:', err);
      }
    };

    checkStatus();

    // Listen for deep link events if in Electron
    // NOTE: Main process now sends pre-validated UUIDs, not raw URLs
    const unsubscribe = window.electronAPI?.onDeepLink?.((mangaId: string) => {
      // The main process already extracted and validated the UUID
      if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(mangaId)) {
        setSelectedMangaId(mangaId);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const handleUpdateRatings = (newRatings: string[]) => {
    setRatingsAllowed(newRatings);
    window.electronAPI.setSetting('ratings_allowed', JSON.stringify(newRatings));
  };

  const handleResetApp = async () => {
    await window.electronAPI.resetApp();
    setProfile(null);
    setMangadexConnected(false);
    setMangadexUsername(null);
    setIsUnlocked(true);
    setIsOnboardingOpen(true);
    setActiveTab('browse');
    setSelectedMangaId(null);
    setActiveReading(null);
  };

  const handleDisconnectMangaDex = async () => {
    await window.electronAPI.disconnectMangaDex();
    setMangadexConnected(false);
    setMangadexUsername(null);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background font-sans text-slate-100 select-none">
      {/* Frameless Titlebar with search & drag support (hidden during reader mode for full immersion) */}
      {!activeReading && (
        <Titlebar
          onOpenMangaById={(id) => setSelectedMangaId(id)}
          onSearchSubmit={(query) => {
            setSearchQuery(query);
            setActiveTab('browse');
          }}
        />
      )}

      {/* Main Layout Area */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
        {/* Sidebar (Desktop) */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          profile={profile}
          mangadexConnected={mangadexConnected}
          mangadexUsername={mangadexUsername}
          onOpenAuthModal={() => setIsOnboardingOpen(true)}
          isOfflineMode={isOfflineMode}
          setIsOfflineMode={setIsOfflineMode}
          activeDownloadsCount={activeDownloadsCount}
          unreadNotificationsCount={unreadNotificationsCount}
        />

        {/* View Switcher */}
        <main className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col bg-background relative">
          {activeTab === 'browse' && (
            <BrowseView
              onSelectManga={(id) => setSelectedMangaId(id)}
              ratingsAllowed={ratingsAllowed}
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery('')}
            />
          )}

          {activeTab === 'library' && (
            <LibraryView
              onSelectManga={(id) => setSelectedMangaId(id)}
              isOfflineMode={isOfflineMode}
            />
          )}

          {activeTab === 'downloads' && (
            <DownloadsView
              onReadChapter={(mId, chId, title, num) => {
                setActiveReading({
                  chapterId: chId,
                  mangaId: mId,
                  mangaTitle: title,
                  chapterNumber: num
                });
              }}
              onSelectManga={(mId) => setSelectedMangaId(mId)}
              isOfflineMode={isOfflineMode}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationsView
              onSelectManga={(id) => setSelectedMangaId(id)}
              onReadChapter={(mId, chId, title, num) => {
                setActiveReading({
                  chapterId: chId,
                  mangaId: mId,
                  mangaTitle: title,
                  chapterNumber: num
                });
              }}
              onUpdateUnreadCount={setUnreadNotificationsCount}
              isOfflineMode={isOfflineMode}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              profile={profile}
              mangadexConnected={mangadexConnected}
              mangadexUsername={mangadexUsername}
              ratingsAllowed={ratingsAllowed}
              setRatingsAllowed={handleUpdateRatings}
              onOpenAuthModal={() => setIsOnboardingOpen(true)}
              onDisconnectMangaDex={handleDisconnectMangaDex}
              onResetApp={handleResetApp}
              onLockSession={() => setIsUnlocked(false)}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (automatically hidden during active reading or full modals) */}
      {!activeReading && !selectedMangaId && !isOnboardingOpen && (isUnlocked || !profile) && (
        <BottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeDownloadsCount={activeDownloadsCount}
          unreadNotificationsCount={unreadNotificationsCount}
        />
      )}

      {/* Manga Detail Modal */}
      {selectedMangaId && (
        <MangaDetailModal
          mangaId={selectedMangaId}
          onClose={() => setSelectedMangaId(null)}
          onReadChapter={(chId, title, num) => {
            setActiveReading({ chapterId: chId, mangaTitle: title, chapterNumber: num });
          }}
        />
      )}

      {/* Immersive Reader Modal */}
      {activeReading && (
        <ReaderModal
          chapterId={activeReading.chapterId}
          mangaId={activeReading.mangaId || selectedMangaId}
          mangaTitle={activeReading.mangaTitle}
          chapterNumber={activeReading.chapterNumber}
          onClose={() => setActiveReading(null)}
          onChapterChange={(nextId, nextNum) => {
            setActiveReading({
              chapterId: nextId,
              mangaId: activeReading.mangaId || selectedMangaId,
              mangaTitle: activeReading.mangaTitle,
              chapterNumber: nextNum
            });
          }}
        />
      )}

      {/* Master Password Unlock Modal */}
      <UnlockModal
        isOpen={!isUnlocked && !!profile}
        onUnlockSuccess={() => setIsUnlocked(true)}
        onResetApp={handleResetApp}
      />

      {/* Onboarding & MangaDex Connection Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        currentProfile={profile}
        onProfileCreated={(p) => setProfile(p)}
        onMangaDexConnected={(user) => {
          setMangadexConnected(true);
          setMangadexUsername(user);
          window.electronAPI.syncLibrary().catch(console.error);
        }}
      />
    </div>
  );
};
