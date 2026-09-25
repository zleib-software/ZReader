import { Preferences } from '@capacitor/preferences';

export interface AppProfile {
  type: 'local';
  name?: string;
  avatarUrl?: string;
  passwordHash?: string;
  passwordSalt?: string;
  hasPassword?: boolean;
  createdAt: number;
}

export interface MangaDexStoredSecrets {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  username?: string;
}

interface EncryptedPayload {
  encrypted: true;
  v: number;
  iv: string;
  data: string;
}

export class AppVaultMobile {
  private inMemoryAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private profileCache: AppProfile | null = null;
  private secretsCache: MangaDexStoredSecrets | null = null;
  private initialized = false;

  private unlockAttempts: number = 0;
  private lockoutUntil: number = 0;
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCKOUT_BASE_MS = 30_000;

  // Cached CryptoKey for AES-256-GCM
  private cachedKey: CryptoKey | null = null;

  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.cachedKey) return this.cachedKey;

    let { value: seedHex } = await Preferences.get({ key: 'zreader_vault_device_salt' });
    if (!seedHex) {
      const arr = new Uint8Array(32);
      crypto.getRandomValues(arr);
      seedHex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
      await Preferences.set({ key: 'zreader_vault_device_salt', value: seedHex });
    }

    const saltBytes = new Uint8Array(seedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const enc = new TextEncoder();
    const appIdentifier = 'zreader-mobile-vault-kek-v2';

    const baseKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(appIdentifier),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    this.cachedKey = aesKey;
    return aesKey;
  }

  private async ensureInit() {
    if (this.initialized) return;
    try {
      const { value: profVal } = await Preferences.get({ key: 'zreader_profile' });
      if (profVal) {
        this.profileCache = JSON.parse(profVal);
      }

      const { value: secVal } = await Preferences.get({ key: 'zreader_mangadex_secrets' });
      if (secVal) {
        try {
          const parsed = JSON.parse(secVal);
          if (parsed && parsed.encrypted && parsed.iv && parsed.data) {
            // Decrypt AES-256-GCM
            const key = await this.getEncryptionKey();
            const iv = new Uint8Array(parsed.iv.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
            const data = new Uint8Array(parsed.data.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
            const decryptedBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
            this.secretsCache = JSON.parse(new TextDecoder().decode(decryptedBuf));
          } else if (parsed && parsed.clientSecret) {
            // Legacy plaintext fallback: auto-migrate to encrypted storage
            this.secretsCache = parsed;
            await this.saveMangaDexSecrets(parsed.clientId, parsed.clientSecret, parsed.refreshToken, parsed.username);
          }
        } catch (decryptErr) {
          console.error('Error decrypting stored mobile secrets:', decryptErr);
          this.secretsCache = null;
        }
      }
    } catch (e) {
      console.error('Error loading mobile vault preferences:', e);
    }
    this.initialized = true;
  }

  // Memory-only access token management
  public setAccessToken(token: string, expiresInSeconds: number) {
    this.inMemoryAccessToken = token;
    this.tokenExpiresAt = Date.now() + Math.max(0, (expiresInSeconds - 180) * 1000);
  }

  public getAccessToken(): string | null {
    if (!this.inMemoryAccessToken) return null;
    return this.inMemoryAccessToken;
  }

  public isTokenExpiringSoon(): boolean {
    if (!this.inMemoryAccessToken) return true;
    return Date.now() >= this.tokenExpiresAt;
  }

  public clearAccessToken() {
    this.inMemoryAccessToken = null;
    this.tokenExpiresAt = 0;
  }

  // Web Crypto Hash for Password Verification
  private async hashPassword(password: string, saltHex: string): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const hashArray = Array.from(new Uint8Array(derivedBits));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private generateSalt(): string {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Timing-safe constant-time string comparison
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  public async getProfile(): Promise<AppProfile | null> {
    await this.ensureInit();
    if (!this.profileCache) return null;
    return {
      ...this.profileCache,
      hasPassword: !!this.profileCache.passwordHash
    };
  }

  public async saveLocalProfile(password: string, name?: string): Promise<{ success: boolean; profile: AppProfile }> {
    await this.ensureInit();
    let hash, salt;
    if (password) {
      salt = this.generateSalt();
      hash = await this.hashPassword(password, salt);
    }

    const profile: AppProfile = {
      type: 'local',
      name: name || 'Leitor',
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: Date.now()
    };

    this.profileCache = profile;
    await Preferences.set({
      key: 'zreader_profile',
      value: JSON.stringify(profile)
    });

    return { success: true, profile };
  }

  public async unlockWithPassword(password: string): Promise<{ success: boolean; locked?: boolean; lockoutSeconds?: number; error?: string }> {
    await this.ensureInit();
    if (!this.profileCache || !this.profileCache.passwordHash || !this.profileCache.passwordSalt) {
      return { success: true };
    }

    const now = Date.now();
    if (this.lockoutUntil > now) {
      const remaining = Math.ceil((this.lockoutUntil - now) / 1000);
      return { success: false, locked: true, lockoutSeconds: remaining, error: `Muitas tentativas. Bloqueado por ${remaining}s.` };
    }

    const testHash = await this.hashPassword(password, this.profileCache.passwordSalt);
    const isValid = this.timingSafeEqual(testHash, this.profileCache.passwordHash);

    if (isValid) {
      this.unlockAttempts = 0;
      this.lockoutUntil = 0;
      return { success: true };
    }

    this.unlockAttempts++;
    if (this.unlockAttempts >= AppVaultMobile.MAX_ATTEMPTS) {
      const multiplier = Math.pow(2, Math.floor(this.unlockAttempts / AppVaultMobile.MAX_ATTEMPTS) - 1);
      this.lockoutUntil = now + (AppVaultMobile.LOCKOUT_BASE_MS * multiplier);
      const lockoutSec = Math.ceil((AppVaultMobile.LOCKOUT_BASE_MS * multiplier) / 1000);
      return { success: false, locked: true, lockoutSeconds: lockoutSec, error: `Muitas tentativas incorretas. Bloqueado por ${lockoutSec}s.` };
    }

    return { success: false, error: 'Senha incorreta. Tente novamente.' };
  }

  // Encrypted MangaDex Secrets Management using AES-256-GCM
  public async saveMangaDexSecrets(clientId: string, clientSecret: string, refreshToken: string, username?: string) {
    await this.ensureInit();
    const secrets: MangaDexStoredSecrets = {
      clientId,
      clientSecret,
      refreshToken,
      username
    };
    this.secretsCache = secrets;

    const key = await this.getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder().encode(JSON.stringify(secrets));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);

    const payload: EncryptedPayload = {
      encrypted: true,
      v: 2,
      iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
      data: Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('')
    };

    await Preferences.set({
      key: 'zreader_mangadex_secrets',
      value: JSON.stringify(payload)
    });
  }

  public async getMangaDexSecrets(): Promise<MangaDexStoredSecrets | null> {
    await this.ensureInit();
    return this.secretsCache;
  }

  public async clearMangaDexSecrets() {
    this.secretsCache = null;
    this.clearAccessToken();
    await Preferences.remove({ key: 'zreader_mangadex_secrets' });
  }

  public async resetAllData() {
    this.profileCache = null;
    this.secretsCache = null;
    this.unlockAttempts = 0;
    this.lockoutUntil = 0;
    this.clearAccessToken();
    await Preferences.clear();
  }
}
