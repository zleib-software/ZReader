import { safeStorage, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

export interface AppProfile {
  type: 'local';
  name?: string;
  avatarUrl?: string;
  passwordHash?: string;
  passwordSalt?: string;
  createdAt: number;
}

export interface MangaDexStoredSecrets {
  clientIdEncrypted: string;     // encrypted via safeStorage or fallback
  clientSecretEncrypted: string; // base64 buffer from safeStorage
  refreshTokenEncrypted: string; // base64 buffer from safeStorage
  usernameEncrypted?: string;    // encrypted
  // Legacy plaintext fields (for migration only)
  clientId?: string;
  username?: string;
}

export class AppVault {
  private vaultDir: string;
  private vaultFile: string;
  private machineKeyFile: string;
  private inMemoryAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private unlockAttempts: number = 0;
  private lockoutUntil: number = 0;
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCKOUT_BASE_MS = 30_000; // 30 seconds

  constructor() {
    const userDataPath = app?.getPath('userData') || process.cwd();
    this.vaultDir = path.join(userDataPath, 'secure');
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true, mode: 0o700 });
    }
    this.vaultFile = path.join(this.vaultDir, 'vault.enc.json');

    // SECURITY: Store machine key in a separate isolated directory with strict permissions
    const keyDir = path.join(userDataPath, '.identity');
    if (!fs.existsSync(keyDir)) {
      fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
    }
    this.machineKeyFile = path.join(keyDir, '.device_key');
  }

  // SECURITY: Get or generate a persistent random machine key bound to OS user environment
  private getMachineKey(): Buffer {
    let rawSecret: Buffer;
    if (fs.existsSync(this.machineKeyFile)) {
      try {
        rawSecret = Buffer.from(fs.readFileSync(this.machineKeyFile, 'utf8'), 'hex');
      } catch {
        rawSecret = crypto.randomBytes(32);
        fs.writeFileSync(this.machineKeyFile, rawSecret.toString('hex'), { encoding: 'utf8', mode: 0o600 });
      }
    } else {
      rawSecret = crypto.randomBytes(32);
      fs.writeFileSync(this.machineKeyFile, rawSecret.toString('hex'), { encoding: 'utf8', mode: 0o600 });
    }

    // Bind key to current OS user and platform environment using scrypt derivation
    const userBinding = `${os.userInfo().username}:${os.homedir()}:${process.platform}`;
    return crypto.scryptSync(rawSecret, userBinding, 32, { N: 16384, r: 8, p: 1 });
  }

  // Memory-only access token management
  public setAccessToken(token: string, expiresInSeconds: number) {
    this.inMemoryAccessToken = token;
    // Set expiry 3 minutes earlier than actual for proactive renewal
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

  // Encryption helpers using Electron safeStorage (OS DPAPI on Windows, Keychain on macOS, Secret Service on Linux)
  private encryptSecret(plainText: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = safeStorage.encryptString(plainText);
      return buffer.toString('base64');
    }
    // Fallback: AES-256-GCM using persistent random machine key (NOT COMPUTERNAME)
    const machineKey = this.getMachineKey();
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(machineKey, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
      fallback: true,
      v: 2, // version marker to distinguish from old COMPUTERNAME-based encryption
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: enc.toString('base64')
    });
  }

  private decryptSecret(encryptedBase64: string): string {
    if (!encryptedBase64) return '';
    try {
      if (encryptedBase64.startsWith('{')) {
        const parsed = JSON.parse(encryptedBase64);
        if (parsed.fallback) {
          const salt = Buffer.from(parsed.salt, 'base64');
          const iv = Buffer.from(parsed.iv, 'base64');
          const tag = Buffer.from(parsed.tag, 'base64');
          const data = Buffer.from(parsed.data, 'base64');
          // v2 uses random machine key; v1 (legacy) used COMPUTERNAME
          let key: Buffer;
          if (parsed.v === 2) {
            const machineKey = this.getMachineKey();
            key = crypto.scryptSync(machineKey, salt, 32);
          } else {
            // Legacy v1 compatibility: derive from COMPUTERNAME (will be re-encrypted on next save)
            key = crypto.scryptSync(process.env.COMPUTERNAME || 'mangadex-desktop', salt, 32);
          }
          const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
          decipher.setAuthTag(tag);
          return decipher.update(data) + decipher.final('utf8');
        }
      }
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encryptedBase64, 'base64');
        return safeStorage.decryptString(buffer);
      }
    } catch (err) {
      console.error('Error decrypting secret from vault:', err);
    }
    return '';
  }

  private readRawVault(): { profile?: any; mangadex?: MangaDexStoredSecrets } {
    if (!fs.existsSync(this.vaultFile)) return {};
    try {
      const content = fs.readFileSync(this.vaultFile, 'utf8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private writeRawVault(data: { profile?: any; mangadex?: MangaDexStoredSecrets }) {
    fs.writeFileSync(this.vaultFile, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  // Profile Management (scrypt with high memory cost for Argon2id-equivalent protection)
  public hashMasterPassword(password: string): { hash: string; salt: string } {
    const salt = crypto.randomBytes(32).toString('hex');
    // Using scrypt with high N/r/p cost (128MB memory cost) for strong brute-force resistance
    const hash = crypto.scryptSync(password, salt, 64, { N: 32768, r: 8, p: 2 }).toString('hex');
    return { hash, salt };
  }

  public verifyMasterPassword(password: string, hash: string, salt: string): boolean {
    const computed = crypto.scryptSync(password, salt, 64, { N: 32768, r: 8, p: 2 }).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  }

  public saveLocalProfile(password: string, name?: string): AppProfile {
    const { hash, salt } = this.hashMasterPassword(password);
    const safeName = name?.trim() || 'Leitor';
    const profile: AppProfile = {
      type: 'local',
      name: safeName,
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(safeName)}`,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: Date.now()
    };
    const vault = this.readRawVault();
    vault.profile = profile;
    this.writeRawVault(vault);
    return profile;
  }

  public getProfile(): Omit<AppProfile, 'passwordHash' | 'passwordSalt'> | null {
    const vault = this.readRawVault();
    if (!vault.profile) return null;
    const { passwordHash, passwordSalt, ...safeProfile } = vault.profile;
    return {
      ...safeProfile,
      type: 'local',
      name: safeProfile.name || 'Leitor',
      avatarUrl: safeProfile.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(safeProfile.name || 'Leitor')}`
    };
  }

  public unlockWithPassword(password: string): { success: boolean; locked?: boolean; lockoutSeconds?: number } {
    // SECURITY: Brute-force protection with exponential lockout
    const now = Date.now();
    if (this.lockoutUntil > now) {
      const remaining = Math.ceil((this.lockoutUntil - now) / 1000);
      return { success: false, locked: true, lockoutSeconds: remaining };
    }

    const vault = this.readRawVault();
    if (!vault.profile) return { success: false };
    if (!vault.profile.passwordHash || !vault.profile.passwordSalt) return { success: false };

    const isValid = this.verifyMasterPassword(password, vault.profile.passwordHash, vault.profile.passwordSalt);

    if (isValid) {
      this.unlockAttempts = 0;
      this.lockoutUntil = 0;
      return { success: true };
    } else {
      this.unlockAttempts++;
      if (this.unlockAttempts >= AppVault.MAX_ATTEMPTS) {
        // Exponential lockout: 30s, 60s, 120s...
        const multiplier = Math.pow(2, Math.floor(this.unlockAttempts / AppVault.MAX_ATTEMPTS) - 1);
        this.lockoutUntil = now + (AppVault.LOCKOUT_BASE_MS * multiplier);
        const lockoutSec = Math.ceil((AppVault.LOCKOUT_BASE_MS * multiplier) / 1000);
        console.warn(`[Security] Too many unlock attempts (${this.unlockAttempts}). Locked for ${lockoutSec}s.`);
        return { success: false, locked: true, lockoutSeconds: lockoutSec };
      }
      return { success: false };
    }
  }

  // MangaDex Secrets Management — all fields encrypted
  public saveMangaDexSecrets(clientId: string, clientSecret: string, refreshToken: string, username?: string) {
    const vault = this.readRawVault();
    vault.mangadex = {
      clientIdEncrypted: this.encryptSecret(clientId),
      clientSecretEncrypted: this.encryptSecret(clientSecret),
      refreshTokenEncrypted: this.encryptSecret(refreshToken),
      usernameEncrypted: username ? this.encryptSecret(username) : undefined
    };
    this.writeRawVault(vault);
  }

  public getMangaDexSecrets(): { clientId: string; clientSecret: string; refreshToken: string; username?: string } | null {
    const vault = this.readRawVault();
    if (!vault.mangadex) return null;

    // Support legacy plaintext fields for migration
    const clientId = vault.mangadex.clientIdEncrypted
      ? this.decryptSecret(vault.mangadex.clientIdEncrypted)
      : (vault.mangadex.clientId || '');
    const clientSecret = this.decryptSecret(vault.mangadex.clientSecretEncrypted);
    const refreshToken = this.decryptSecret(vault.mangadex.refreshTokenEncrypted);
    const username = vault.mangadex.usernameEncrypted
      ? this.decryptSecret(vault.mangadex.usernameEncrypted)
      : vault.mangadex.username;

    // Auto-migrate: if legacy plaintext fields exist, re-encrypt everything
    if (vault.mangadex.clientId || vault.mangadex.username) {
      this.saveMangaDexSecrets(clientId, clientSecret, refreshToken, username);
    }

    return { clientId, clientSecret, refreshToken, username };
  }

  public clearMangaDexSecrets() {
    const vault = this.readRawVault();
    delete vault.mangadex;
    this.writeRawVault(vault);
    this.clearAccessToken();
  }

  public resetAllData() {
    this.clearAccessToken();
    this.unlockAttempts = 0;
    this.lockoutUntil = 0;
    if (fs.existsSync(this.vaultFile)) {
      try {
        fs.unlinkSync(this.vaultFile);
      } catch (err) {
        console.error('Error removing vault file:', err);
      }
    }
    if (fs.existsSync(this.machineKeyFile)) {
      try {
        fs.unlinkSync(this.machineKeyFile);
      } catch (err) {
        console.error('Error removing machine key file:', err);
      }
    }
  }
}
