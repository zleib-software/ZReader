import 'fake-indexeddb/auto';
import { AppDatabaseMobile } from '../src/services/mobile/database';
import { AppVaultMobile } from '../src/services/mobile/vault';
import { DownloadManagerMobile } from '../src/services/mobile/downloads';
import { MangaDexApiMobile } from '../src/services/mobile/mangadex';
import { initMobileBridge } from '../src/services/mobile/bridge';

// Setup mock window and localStorage environment for Node.js
const memoryStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => memoryStorage[key] || null,
  setItem: (key: string, val: string) => { memoryStorage[key] = String(val); },
  removeItem: (key: string) => { delete memoryStorage[key]; },
  clear: () => { Object.keys(memoryStorage).forEach(k => delete memoryStorage[k]); },
  key: (i: number) => Object.keys(memoryStorage)[i] || null,
  get length() { return Object.keys(memoryStorage).length; }
};

(globalThis as any).window = globalThis;
(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window.localStorage = mockLocalStorage;

// Polyfill URL.createObjectURL for Node environment
if (!URL.createObjectURL) {
  URL.createObjectURL = (blob: any) => `blob:mock-uuid-${Date.now()}-${Math.random()}`;
  URL.revokeObjectURL = () => {};
}

async function runTests() {
  console.log('========================================');
  console.log('🧪 INICIANDO SUÍTE DE TESTES ZREADER MOBILE & OFFLINE');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST 1: AppDatabaseMobile (IndexedDB)
  // -------------------------------------------------------------
  console.log('\n--- 1. Testando Banco de Dados Local (IndexedDB) ---');
  const db = new AppDatabaseMobile();

  // Test 1.1: Cache Manga
  await db.saveMangaCache({
    id: 'manga-uuid-1',
    title: 'Solo Leveling',
    description: 'Sung Jin-Woo o caçador mais fraco',
    cover_url: 'https://uploads.mangadex.org/covers/manga-uuid-1/cover.jpg',
    status: 'completed',
    content_rating: 'safe',
    tags_json: JSON.stringify(['Action', 'Fantasy']),
    cached_at: Date.now()
  });

  const cachedManga = await db.getMangaCache('manga-uuid-1');
  assert(cachedManga !== null && cachedManga.title === 'Solo Leveling', 'Cache de mangá gravado e recuperado');

  // Test 1.2: Cache Chapters
  await db.saveChaptersCache([
    {
      id: 'chapter-uuid-1',
      manga_id: 'manga-uuid-1',
      chapter_number: '1',
      title: 'Prólogo',
      language: 'pt-br',
      scanlation_group: 'Scan Br',
      cached_at: Date.now()
    },
    {
      id: 'chapter-uuid-2',
      manga_id: 'manga-uuid-1',
      chapter_number: '2',
      title: 'O Despertar',
      language: 'pt-br',
      scanlation_group: 'Scan Br',
      cached_at: Date.now()
    }
  ]);

  const chapters = await db.getCachedChapters('manga-uuid-1');
  assert(chapters.length === 2 && chapters[0].chapter_number === '2', 'Capítulos cacheados e ordenados decrescente');

  // Test 1.3: Library
  await db.setLibraryStatus('manga-uuid-1', 'reading');
  const libStatus = await db.getLibraryStatus('manga-uuid-1');
  assert(libStatus === 'reading', 'Status da biblioteca atualizado para "reading"');

  const libraryList = await db.getLibrary();
  assert(libraryList.length === 1 && libraryList[0].title === 'Solo Leveling', 'Lista da biblioteca com junção de metadados');

  // Test 1.4: Reading Progress
  await db.saveReadingProgress({
    chapter_id: 'chapter-uuid-1',
    manga_id: 'manga-uuid-1',
    last_page: 18,
    read_at: Date.now(),
    synced_to_mangadex: 0
  });

  const progress = await db.getChapterProgress('chapter-uuid-1');
  assert(progress !== null && progress.last_page === 18, 'Progresso de leitura registrado e recuperado');

  const readChapters = await db.getMangaReadChapters('manga-uuid-1');
  assert(readChapters.includes('chapter-uuid-1'), 'Lista de capítulos lidos do mangá');

  // Test 1.5: App Settings
  await db.setSetting('theme', 'editorial-dark');
  const themeSetting = await db.getSetting('theme');
  assert(themeSetting === 'editorial-dark', 'Configurações de aplicativo salvas');

  // -------------------------------------------------------------
  // TEST 2: AppVaultMobile (Master Password & Security)
  // -------------------------------------------------------------
  console.log('\n--- 2. Testando Cofre e Autenticação (AppVaultMobile) ---');
  const vault = new AppVaultMobile();

  const profileRes = await vault.saveLocalProfile('minhasenha123', 'Otaku Master');
  assert(profileRes.success && profileRes.profile.name === 'Otaku Master', 'Criação de perfil com senha criptografada');

  const unlockOk = await vault.unlockWithPassword('minhasenha123');
  assert(unlockOk.success, 'Desbloqueio com senha correta com sucesso');

  const unlockFail = await vault.unlockWithPassword('senhaerrada');
  assert(!unlockFail.success, 'Rejeição de senha incorreta confirmada');

  await vault.saveMangaDexSecrets('client-123', 'secret-456', 'refresh-token-xyz', 'manga_user');
  const secrets = await vault.getMangaDexSecrets();
  assert(secrets !== null && secrets.clientId === 'client-123', 'Credenciais MangaDex armazenadas com segurança');

  // -------------------------------------------------------------
  // TEST 3: Downloads & Offline Reading
  // -------------------------------------------------------------
  console.log('\n--- 3. Testando Downloads e Funcionamento 100% Offline ---');
  const api = new MangaDexApiMobile(vault, db);
  const downloadManager = new DownloadManagerMobile(db, api);

  // Simular download de capítulo completo
  await db.upsertDownload({
    chapter_id: 'chapter-uuid-1',
    manga_id: 'manga-uuid-1',
    status: 'downloading',
    local_path: 'downloads/manga-uuid-1/chapter-uuid-1',
    pages_total: 3,
    pages_done: 0,
    downloaded_at: null,
    manga_title: 'Solo Leveling',
    chapter_number: '1',
    chapter_title: 'Prólogo'
  });

  // Salvar 3 páginas simuladas como Blobs locais no banco offline
  const mockBlob1 = new Blob(['fake image data page 1'], { type: 'image/jpeg' });
  const mockBlob2 = new Blob(['fake image data page 2'], { type: 'image/jpeg' });
  const mockBlob3 = new Blob(['fake image data page 3'], { type: 'image/jpeg' });

  await (downloadManager as any).saveBlobLocally('chapter-uuid-1', 1, mockBlob1);
  await (downloadManager as any).saveBlobLocally('chapter-uuid-1', 2, mockBlob2);
  await (downloadManager as any).saveBlobLocally('chapter-uuid-1', 3, mockBlob3);

  await db.upsertDownload({
    chapter_id: 'chapter-uuid-1',
    manga_id: 'manga-uuid-1',
    status: 'completed',
    local_path: 'downloads/manga-uuid-1/chapter-uuid-1',
    pages_total: 3,
    pages_done: 3,
    downloaded_at: Date.now(),
    manga_title: 'Solo Leveling',
    chapter_number: '1',
    chapter_title: 'Prólogo'
  });

  const downloadsList = await db.getDownloads();
  assert(downloadsList.length === 1 && downloadsList[0].status === 'completed', 'Download registrado como completed na lista');

  // Testar recuperação das páginas offline
  const offlinePages = await downloadManager.getOfflineChapterPages('manga-uuid-1', 'chapter-uuid-1');
  assert(offlinePages !== null && offlinePages.length === 3, 'Páginas offline recuperadas com sucesso (3 páginas)');
  assert(offlinePages![0].startsWith('blob:'), 'URLs das páginas offline no formato seguro e utilizável pelo leitor');

  // -------------------------------------------------------------
  // TEST 4: Mobile Bridge (window.electronAPI Polyfill)
  // -------------------------------------------------------------
  console.log('\n--- 4. Testando Ponte Universal Mobile (window.electronAPI) ---');
  delete (window as any).process;
  initMobileBridge();

  const bridge = (window as any).electronAPI;
  assert(typeof bridge !== 'undefined', 'window.electronAPI foi injetado com sucesso');
  assert(typeof bridge.getProfile === 'function', 'electronAPI.getProfile presente');
  assert(typeof bridge.getLibrary === 'function', 'electronAPI.getLibrary presente');
  assert(typeof bridge.getDownloads === 'function', 'electronAPI.getDownloads presente');
  assert(typeof bridge.getOfflinePages === 'function', 'electronAPI.getOfflinePages presente');
  assert(typeof bridge.saveReadingProgress === 'function', 'electronAPI.saveReadingProgress presente');
  assert(typeof bridge.toggleFullscreen === 'function', 'electronAPI.toggleFullscreen presente');

  // Executar chamadas via bridge (como os componentes React fazem)
  const bridgeLibrary = await bridge.getLibrary();
  assert(bridgeLibrary.length === 1, 'bridge.getLibrary() retornou registros do IndexedDB');

  const bridgeOfflinePages = await bridge.getOfflinePages('manga-uuid-1', 'chapter-uuid-1');
  assert(bridgeOfflinePages.length === 3, 'bridge.getOfflinePages() entregou as 3 páginas para o ReaderModal');

  // -------------------------------------------------------------
  // RESULTADOS FINAIS
  // -------------------------------------------------------------
  console.log('\n========================================');
  console.log(`🎉 TESTES CONCLUÍDOS: ${passed} PASSOU | ${failed} FALHOU`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal durante a execução dos testes:', err);
  process.exit(1);
});
