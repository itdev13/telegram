import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Installation, InstallationDocument } from '../schemas/installation.schema';
import { CryptoService } from '../crypto/crypto.service';
import { GhlSsoPayload, GhlTokenResponse } from '../common/interfaces';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly ghlApiBase: string;

  constructor(
    @InjectModel(Installation.name)
    private installationModel: Model<InstallationDocument>,
    private crypto: CryptoService,
    private config: ConfigService,
  ) {
    this.ghlApiBase = this.config.getOrThrow('GHL_API_BASE');
  }

  // ── OAuth: Exchange authorization code for tokens ──────────

  async handleOAuthCallback(code: string): Promise<void> {
    const tokenResponse = await axios.post<GhlTokenResponse>(
      `${this.ghlApiBase}/oauth/token`,
      {
        client_id: this.config.getOrThrow('GHL_CLIENT_ID'),
        client_secret: this.config.getOrThrow('GHL_CLIENT_SECRET'),
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.getOrThrow('GHL_REDIRECT_URI'),
      },
    );

    const {
      access_token,
      refresh_token,
      expires_in,
      locationId,
      companyId,
    } = tokenResponse.data;

    if (!locationId || !companyId) {
      throw new Error('OAuth response missing locationId or companyId');
    }

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await this.installationModel.findOneAndUpdate(
      { locationId },
      {
        companyId,
        locationId,
        accessToken: this.crypto.encrypt(access_token),
        refreshToken: this.crypto.encrypt(refresh_token),
        tokenExpiresAt: expiresAt,
        $setOnInsert: { conversationProviderId: '' },
      },
      { upsert: true, new: true },
    );

    this.logger.log(`OAuth tokens stored for location: ${locationId}`);
  }

  // ── OAuth: Refresh expired access token ────────────────────

  async refreshAccessToken(locationId: string): Promise<string> {
    const installation = await this.installationModel.findOne({ locationId });

    if (!installation) {
      throw new UnauthorizedException(`No installation found for location: ${locationId}`);
    }

    const refreshToken = this.crypto.decrypt(installation.refreshToken);

    const tokenResponse = await axios.post<GhlTokenResponse>(
      `${this.ghlApiBase}/oauth/token`,
      {
        client_id: this.config.getOrThrow('GHL_CLIENT_ID'),
        client_secret: this.config.getOrThrow('GHL_CLIENT_SECRET'),
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
    );

    const { access_token, refresh_token: newRefreshToken, expires_in } =
      tokenResponse.data;

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await this.installationModel.updateOne(
      { locationId },
      {
        accessToken: this.crypto.encrypt(access_token),
        refreshToken: this.crypto.encrypt(newRefreshToken),
        tokenExpiresAt: expiresAt,
      },
    );

    return access_token;
  }

  // ── Get valid access token (auto-refresh if expired) ───────

  async getAccessToken(locationId: string): Promise<string> {
    const installation = await this.installationModel.findOne({ locationId });

    if (!installation) {
      throw new UnauthorizedException(`No installation for location: ${locationId}`);
    }

    // If token expires within 5 minutes, refresh it
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    if (installation.tokenExpiresAt < fiveMinutesFromNow) {
      this.logger.log(`Token expired for ${locationId}, refreshing...`);
      return this.refreshAccessToken(locationId);
    }

    return this.crypto.decrypt(installation.accessToken);
  }

  // ── SSO: Decrypt Custom Page SSO payload ───────────────────

  decryptSsoPayload(encryptedPayload: string): GhlSsoPayload {
    try {
      return this.crypto.decryptSsoPayload(encryptedPayload) as GhlSsoPayload;
    } catch (error) {
      this.logger.error('SSO decryption failed', error);
      throw new UnauthorizedException('Invalid or expired SSO session');
    }
  }
}
