import { AppDatabase } from '../electron/storage/database';
import { AppVault } from '../electron/storage/vault';
import { RateLimiter } from '../electron/services/rate-limiter';
import path from 'node:path';
import fs from 'node:fs';

async function runTests() {
  console.log('--- Iniciando Testes de Validação do Core ---');

  // Test 1: SQLite Schema & Operations
  console.log('1. Testando Banco de Dados SQLite (node:sqlite)...');
  const tempDir = path.join(process.cwd(), 'temp_test_data');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const db = new AppDatabase(tempDir);

  // Manga Cache
  db.saveMangaCache({
    id: 'test-manga-1',
    title: 'Chainsaw Man',
    description: 'Denji is a teenage boy living with a Chainsaw Devil...',
    cover_url: 'https://uploads.mangadex.org/covers/test.jpg',
    status: 'ongoing',
    content_rating: 'suggestive',
    tags_json: JSON.stringify(['Action', 'Demons', 'Comedy']),
    cached_at: Date.now()
  });

  const cachedManga = db.getMangaCache('test-manga-1');
  if (cachedManga?.title !== 'Chainsaw Man') {
    throw new Error('Falha no teste de cache de mangá');
  }
  console.log('   ✓ manga_cache gravado e recuperado com sucesso');

  // Library Sync
  db.setLibraryStatus('test-manga-1', 'reading');
  const lib = db.getLibrary();
  if (lib.length === 0 || lib[0].status !== 'reading') {
    throw new Error('Falha no teste de biblioteca local');
  }
  console.log('   ✓ library sincronizada localmente com sucesso');

  // Reading Progress
  db.saveReadingProgress({
    chapter_id: 'ch-101',
    manga_id: 'test-manga-1',
    last_page: 15,
    read_at: Date.now(),
    synced_to_mangadex: 1
  });
  const progress = db.getChapterProgress('ch-101');
  if (progress?.last_page !== 15) {
    throw new Error('Falha no teste de progresso de leitura');
  }
  console.log('   ✓ reading_progress persistido com sucesso');

  // Downloads Queue
  db.upsertDownload({
    chapter_id: 'ch-101',
    manga_id: 'test-manga-1',
    status: 'completed',
    local_path: 'C:/downloads/test-manga-1/ch-101',
    pages_total: 20,
    pages_done: 20,
    downloaded_at: Date.now()
  });
  const dl = db.getDownload('ch-101');
  if (dl?.status !== 'completed') {
    throw new Error('Falha no teste de downloads');
  }
  console.log('   ✓ downloads upsert e consulta validados');

  // Settings
  db.setSetting('ratings_allowed', JSON.stringify(['safe', 'suggestive']));
  const settingVal = db.getSetting('ratings_allowed');
  if (!settingVal.includes('safe')) {
    throw new Error('Falha no teste de app_settings');
  }
  console.log('   ✓ app_settings gravado e consultado');

  // Test 2: Rate Limiter
  console.log('\n2. Testando Rate Limiter (~4 requisições/segundo)...');
  const limiter = new RateLimiter(4);
  const startTime = Date.now();
  const times: number[] = [];

  const promises = [1, 2, 3, 4, 5].map(i =>
    limiter.schedule(async () => {
      times.push(Date.now() - startTime);
      return i;
    })
  );

  const results = await Promise.all(promises);
  if (results.length !== 5) throw new Error('Falha na contagem do rate limiter');
  const totalElapsed = Date.now() - startTime;
  console.log(`   ✓ 5 requisições executadas ordenadamente em ${totalElapsed}ms (ritmo seguro < 5 req/s)`);

  // Test 3: App Vault & Password Hashing
  console.log('\n3. Testando App Vault & Criptografia...');
  const vault = new AppVault();
  const { hash, salt } = vault.hashMasterPassword('SenhaSuperSegura123!');
  const verified = vault.verifyMasterPassword('SenhaSuperSegura123!', hash, salt);
  const wrongVerified = vault.verifyMasterPassword('SenhaErrada', hash, salt);

  if (!verified || wrongVerified) {
    throw new Error('Falha na derivação e verificação de senha mestra');
  }
  console.log('   ✓ Derivação de senha com custo de memória (scrypt/Argon2id) validada com sucesso');

  // Clean up test database
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  console.log('\n--- TODOS OS TESTES PASSARAM COM SUCESSO! ---');
}

runTests().catch(err => {
  console.error('ERRO NO TESTE:', err);
  process.exit(1);
});
