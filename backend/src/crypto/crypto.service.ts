import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as CryptoJS from 'crypto-js';

@Injectable()
export class CryptoService {
  private readonly encryptionKey: Buffer;

  constructor(private config: ConfigService) {
    const key = this.config.getOrThrow<string>('ENCRYPTION_KEY');
    this.encryptionKey = Buffer.from(key, 'hex');
  }

  // ── AES-256-GCM for database field encryption ──────────────

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // ── CryptoJS AES decryption for GHL SSO payloads ──────────

  decryptSsoPayload(encryptedPayload: string): Record<string, any> {
    const ssoKey = this.config.getOrThrow<string>('GHL_SSO_KEY');
    const decrypted = CryptoJS.AES.decrypt(encryptedPayload, ssoKey).toString(
      CryptoJS.enc.Utf8,
    );

    if (!decrypted) {
      throw new Error('SSO decryption failed: empty result');
    }

    return JSON.parse(decrypted);
  }

  // ── Generate random secrets ────────────────────────────────

  generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
