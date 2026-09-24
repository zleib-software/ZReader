import { session, shell, BrowserWindow } from 'electron';

export function setupSecurityPolicies(mainWindow: BrowserWindow) {
  // Ensure clean headers (no unwanted referer blocks) for MangaDex image requests
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.url.includes('mangadex.org') || details.url.includes('mangadex.network')) {
      delete details.requestHeaders['Referer'];
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  // Enforce Content-Security-Policy (CSP)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com data:; " +
          "img-src 'self' data: blob: https://uploads.mangadex.org https://*.mangadex.network https://api.dicebear.com file:; " +
          "connect-src 'self' https://api.mangadex.org https://auth.mangadex.org https://api.mangadex.network https://*.mangadex.network https://uploads.mangadex.org https://api.dicebear.com; " +
          "object-src 'none'; " +
          "base-uri 'none'; " +
          "form-action 'none'; " +
          "frame-ancestors 'none';"
        ]
      }
    });
  });

  // Block creation of arbitrary new windows / popups from inside renderer
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external URLs in default system browser
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Block in-app navigations away from the application (strictly block arbitrary file:// navigation)
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const isDevServer = navigationUrl.startsWith('http://localhost:5173') || navigationUrl.startsWith('http://127.0.0.1:5173');
    const isPackagedApp = navigationUrl.startsWith('file:') && (navigationUrl.endsWith('/dist/index.html') || navigationUrl.endsWith('\\dist\\index.html') || navigationUrl.endsWith('index.html'));

    if (!isDevServer && !isPackagedApp) {
      event.preventDefault();
      if (navigationUrl.startsWith('https:') || navigationUrl.startsWith('http:')) {
        shell.openExternal(navigationUrl);
      }
    }
  });

  // Deny all unnecessary permissions (camera, microphone, geolocation, etc.)
  session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
}
