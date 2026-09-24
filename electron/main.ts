import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { AppVault } from './storage/vault';
import { AppDatabase } from './storage/database';
import { MangaDexApi } from './services/mangadex-api';
import { MangaDexHomeService } from './services/mangadex-home';
import { DownloadManager } from './services/download-manager';
import { registerIpcHandlers } from './ipc/handlers';
import { setupSecurityPolicies } from './security';

app.setName('ZReader');

function ensureUserDataMigration() {
  try {
    const currentPath = app.getPath('userData');
    const appDataRoot = app.getPath('appData');

    if (!fs.existsSync(currentPath)) {
      fs.mkdirSync(currentPath, { recursive: true });
    }

    const currentDb = path.join(currentPath, 'data', 'mangadex_reader.sqlite');
    const currentVault = path.join(currentPath, 'secure', 'vault.enc.json');

    // If current directory already has both database and vault, nothing to migrate
    if (fs.existsSync(currentDb) && fs.existsSync(currentVault)) {
      return;
    }

    const legacyDirNames = [
      'MangaDex Reader',
      'mangadex-desktop-reader',
      'zreader',
      'com.zreader.app'
    ];

    for (const legacyName of legacyDirNames) {
      const legacyPath = path.join(appDataRoot, legacyName);
      if (fs.existsSync(legacyPath) && legacyPath.toLowerCase() !== currentPath.toLowerCase()) {
        const legacyDb = path.join(legacyPath, 'data', 'mangadex_reader.sqlite');
        if (!fs.existsSync(currentDb) && fs.existsSync(legacyDb)) {
          const destDataDir = path.join(currentPath, 'data');
          fs.mkdirSync(destDataDir, { recursive: true });
          fs.copyFileSync(legacyDb, currentDb);
          console.log(`[Migration] SQLite DB migrado com sucesso de "${legacyName}" para "${currentPath}"!`);
        }

        const legacyVault = path.join(legacyPath, 'secure', 'vault.enc.json');
        if (!fs.existsSync(currentVault) && fs.existsSync(legacyVault)) {
          const destSecureDir = path.join(currentPath, 'secure');
          fs.mkdirSync(destSecureDir, { recursive: true });
          fs.copyFileSync(legacyVault, currentVault);
          console.log(`[Migration] Cofre de chaves/sessão migrado com sucesso de "${legacyName}"!`);
        }

        const legacyDownloads = path.join(legacyPath, 'downloads');
        const currentDownloads = path.join(currentPath, 'downloads');
        if (!fs.existsSync(currentDownloads) && fs.existsSync(legacyDownloads)) {
          try {
            fs.cpSync(legacyDownloads, currentDownloads, { recursive: true });
            console.log(`[Migration] Downloads migrados com sucesso de "${legacyName}"!`);
          } catch (e) {
            console.error('[Migration] Falha ao copiar pasta de downloads:', e);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Migration] Erro durante verificação de versão anterior:', err);
  }
}

// Execute migration check on startup before storage initialization
ensureUserDataMigration();

let mainWindow: BrowserWindow | null = null;

// Deep link protocol handling: zreader:// and mangadex://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('zreader', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('zreader');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0D0A0E',
    icon: path.join(__dirname, '../build/icon.png'),
    frame: false, // Custom frameless window for modern sleek UI
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  setupSecurityPolicies(mainWindow);

  // Initialize storage & services
  const vault = new AppVault();
  const db = new AppDatabase();
  const api = new MangaDexApi(vault, db);
  const homeService = new MangaDexHomeService(api);
  const downloads = new DownloadManager(db, homeService);

  // Register IPC handlers
  registerIpcHandlers(vault, db, api, homeService, downloads, mainWindow);

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Check for deep link in commandLine
      const deepLink = commandLine.find(arg => arg.startsWith('mangadex://') || arg.startsWith('zreader://'));
      if (deepLink) {
        // SECURITY: Extract and validate UUID in main process to prevent injection
        const uuidMatch = deepLink.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (uuidMatch) {
          mainWindow.webContents.send('deep-link', uuidMatch[1]); // Send only the clean UUID
        } else {
          console.warn(`[Security] Deep link rejected - no valid UUID found: ${deepLink.substring(0, 60)}`);
        }
      }
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
