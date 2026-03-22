import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { Model } from 'mongoose';
import { GhlLocationTokenResponse, GhlSsoPayload, GhlTokenResponse } from '../common/interfaces';
import { CryptoService } from '../crypto/crypto.service';
import { CompanyLocation, CompanyLocationDocument } from '../schemas/company-location.schema';
import { CompanyToken, CompanyTokenDocument } from '../schemas/company-token.schema';
import { Installation, InstallationDocument } from '../schemas/installation.schema';
import { Referral, ReferralDocument } from '../schemas/referral.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly ghlApiBase: string;

  constructor(
    @InjectModel(Installation.name)
    private installationModel: Model<InstallationDocument>,
    @InjectModel(CompanyToken.name)
    private companyTokenModel: Model<CompanyTokenDocument>,
    @InjectModel(CompanyLocation.name)
    private companyLocationModel: Model<CompanyLocationDocument>,
    @InjectModel(Referral.name)
    private referralModel: Model<ReferralDocument>,
    private crypto: CryptoService,
    private config: ConfigService,
  ) {
    this.ghlApiBase = this.config.getOrThrow('GHL_API_BASE');
  }

  // ── OAuth: Exchange authorization code for tokens ──────────

  async handleOAuthCallback(code: string, state?: string): Promise<void> {
    this.logger.log(`OAuth token exchange starting for code: ${code.substring(0, 8)}...`);
    this.logger.log(`Using redirect_uri: ${this.config.getOrThrow('GHL_REDIRECT_URI')}`);
    this.logger.log(
      `Using client_id: ${this.config.getOrThrow('GHL_CLIENT_ID').substring(0, 8)}...`,
    );

    let tokenResponse: { data: GhlTokenResponse };
    try {
      tokenResponse = await axios.post<GhlTokenResponse>(
        `${this.ghlApiBase}/oauth/token`,
        new URLSearchParams({
          client_id: this.config.getOrThrow('GHL_CLIENT_ID'),
          client_secret: this.config.getOrThrow('GHL_CLIENT_SECRET'),
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.config.getOrThrow('GHL_REDIRECT_URI'),
        }),
      );
      this.logger.log(
        `Token exchange successful, got locationId=${tokenResponse.data.locationId}, companyId=${tokenResponse.data.companyId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Token exchange failed: status=${error?.response?.status}, data=${JSON.stringify(error?.response?.data)}`,
      );
      throw error;
    }

    const { access_token, refresh_token, expires_in, locationId, companyId } = tokenResponse.data;

    // Decode referral state if present
    let referralData: { ref?: string; campaign?: string } = {};
    if (state) {
      try {
        referralData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      } catch {
        this.logger.warn('Failed to decode OAuth state parameter');
      }
    }

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    if (locationId) {
      // ── Location-level install ──
      await this.installationModel.findOneAndUpdate(
        { locationId },
        {
          companyId: companyId || '',
          locationId,
          accessToken: this.crypto.encrypt(access_token),
          refreshToken: this.crypto.encrypt(refresh_token),
          tokenExpiresAt: expiresAt,
          status: 'active',
          installedAt: new Date(),
          ...(referralData.ref ? { referralCode: referralData.ref } : {}),
          $setOnInsert: {
            conversationProviderId: this.config.get('GHL_CONVERSATION_PROVIDER_ID', ''),
          },
        },
        { upsert: true, new: true },
      );

      this.logger.log(`OAuth tokens stored for location: ${locationId}`);

      // Track referral if present
      if (referralData.ref) {
        await this.upsertReferral(referralData.ref, companyId, locationId, referralData.campaign);
      }
    } else if (companyId) {
      // ── Company-level install ──
      await this.companyTokenModel.findOneAndUpdate(
        { companyId },
        {
          companyId,
          accessToken: this.crypto.encrypt(access_token),
          refreshToken: this.crypto.encrypt(refresh_token),
          tokenExpiresAt: expiresAt,
          isActive: true,
        },
        { upsert: true, new: true },
      );

      this.logger.log(`Company-level OAuth tokens stored for company: ${companyId}`);

      // Fetch and store all sub-account location IDs
      try {
        const locations = await this.getCompanyLocations(access_token, companyId);
        const locationIds = locations.map((loc) => loc.id);

        await this.companyLocationModel.findOneAndUpdate(
          { companyId },
          { companyId, locationIds },
          { upsert: true, new: true },
        );

        this.logger.log(`Stored ${locationIds.length} locations for company: ${companyId}`);
      } catch (error) {
        this.logger.error(`Failed to fetch company locations for ${companyId}`, error);
      }

      // Track referral if present
      if (referralData.ref) {
        await this.upsertReferral(referralData.ref, companyId, undefined, referralData.campaign);
      }
    } else {
      throw new Error('OAuth response missing both locationId and companyId');
    }
  }

  // ── Fetch company locations (uses axios directly to avoid circular dep) ──

  private async getCompanyLocations(
    accessToken: string,
    companyId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const apiVersion = this.config.getOrThrow('GHL_API_VERSION');
    const res = await axios.get(`${this.ghlApiBase}/locations/search`, {
      params: { companyId },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: apiVersion,
      },
    });

    return res.data.locations || [];
  }

  // ── Generate location-level token from company token ──

  async generateLocationToken(
    companyId: string,
    locationId: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const companyToken = await this.companyTokenModel.findOne({
      companyId,
      isActive: true,
    });

    if (!companyToken) {
      throw new UnauthorizedException(`No active company token for company: ${companyId}`);
    }

    // Refresh company token if expiring within 5 minutes
    let accessToken = this.crypto.decrypt(companyToken.accessToken);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    if (companyToken.tokenExpiresAt < fiveMinutesFromNow) {
      accessToken = await this.refreshCompanyToken(companyId);
    }

    try {
      const res = await axios.post<GhlLocationTokenResponse>(
        `${this.ghlApiBase}/oauth/locationToken`,
        { companyId, locationId },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Version: this.config.getOrThrow('GHL_API_VERSION'),
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Location token generated for ${locationId} from company ${companyId}`);

      return {
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
        expiresIn: res.data.expires_in,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to generate location token for ${locationId} from company ${companyId}` +
          ` | Status: ${error?.response?.status}` +
          ` | Response: ${JSON.stringify(error?.response?.data)}`,
      );
      throw error;
    }
  }

  // ── Refresh company-level token ──

  private async refreshCompanyToken(companyId: string): Promise<string> {
    const companyToken = await this.companyTokenModel.findOne({ companyId });
    if (!companyToken) {
      throw new UnauthorizedException(`No company token for: ${companyId}`);
    }

    const refreshToken = this.crypto.decrypt(companyToken.refreshToken);

    const tokenResponse = await axios.post<GhlTokenResponse>(
      `${this.ghlApiBase}/oauth/token`,
      new URLSearchParams({
        client_id: this.config.getOrThrow('GHL_CLIENT_ID'),
        client_secret: this.config.getOrThrow('GHL_CLIENT_SECRET'),
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );

    const { access_token, refresh_token: newRefreshToken, expires_in } = tokenResponse.data;

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await this.companyTokenModel.updateOne(
      { companyId },
      {
        accessToken: this.crypto.encrypt(access_token),
        refreshToken: this.crypto.encrypt(newRefreshToken),
        tokenExpiresAt: expiresAt,
      },
    );

    return access_token;
  }

  // ── OAuth: Refresh expired access token (location-level) ────

  async refreshAccessToken(locationId: string): Promise<string> {
    const installation = await this.installationModel.findOne({ locationId });

    if (!installation) {
      throw new UnauthorizedException(`No installation found for location: ${locationId}`);
    }

    const refreshToken = this.crypto.decrypt(installation.refreshToken);

    try {
      const tokenResponse = await axios.post<GhlTokenResponse>(
        `${this.ghlApiBase}/oauth/token`,
        new URLSearchParams({
          client_id: this.config.getOrThrow('GHL_CLIENT_ID'),
          client_secret: this.config.getOrThrow('GHL_CLIENT_SECRET'),
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      );

      const { access_token, refresh_token: newRefreshToken, expires_in } = tokenResponse.data;

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
    } catch (error: any) {
      // Race condition handling: if another process already refreshed
      if (error?.response?.data?.error === 'invalid_grant') {
        this.logger.warn(
          `invalid_grant for ${locationId}, checking if token was refreshed by another process`,
        );

        const freshInstallation = await this.installationModel.findOne({ locationId });
        if (freshInstallation && freshInstallation.accessToken !== installation.accessToken) {
          this.logger.log(`Token was refreshed by another process for ${locationId}`);
          return this.crypto.decrypt(freshInstallation.accessToken);
        }
      }

      throw error;
    }
  }

  // ── Get valid access token (auto-refresh, company fallback) ──

  async getAccessToken(locationId: string): Promise<string> {
    // Step 1: Check for active installation
    const installation = await this.installationModel.findOne({
      locationId,
      $or: [{ status: 'active' }, { status: { $exists: false } }],
    });

    if (installation && installation.accessToken) {
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
      if (installation.tokenExpiresAt && installation.tokenExpiresAt < fiveMinutesFromNow) {
        this.logger.log(`Token expired for ${locationId}, refreshing...`);
        return this.refreshAccessToken(locationId);
      }
      return this.crypto.decrypt(installation.accessToken);
    }

    // Step 2: No tokens — try company token fallback to generate location token
    const companyLocation = await this.companyLocationModel.findOne({
      locationIds: locationId,
    });

    if (companyLocation) {
      this.logger.log(
        `No valid token for ${locationId}, generating from company ${companyLocation.companyId}`,
      );

      const locationToken = await this.generateLocationToken(companyLocation.companyId, locationId);

      const expiresAt = new Date(Date.now() + locationToken.expiresIn * 1000);

      // Update or create installation record with generated token
      await this.installationModel.findOneAndUpdate(
        { locationId },
        {
          companyId: companyLocation.companyId,
          locationId,
          accessToken: this.crypto.encrypt(locationToken.accessToken),
          refreshToken: this.crypto.encrypt(locationToken.refreshToken),
          tokenExpiresAt: expiresAt,
          status: 'active',
          installedAt: new Date(),
          $setOnInsert: {
            conversationProviderId: this.config.get('GHL_CONVERSATION_PROVIDER_ID', ''),
          },
        },
        { upsert: true, new: true },
      );

      return locationToken.accessToken;
    }

    throw new UnauthorizedException(`No installation for location: ${locationId}`);
  }

  // ── Upsert referral record ──

  private async upsertReferral(
    referralCode: string,
    companyId?: string,
    locationId?: string,
    campaign?: string,
  ): Promise<void> {
    try {
      const filter: Record<string, any> = { referralCode };
      if (locationId) filter.locationId = locationId;
      else if (companyId) filter.companyId = companyId;

      await this.referralModel.findOneAndUpdate(
        filter,
        {
          referralCode,
          ...(companyId ? { companyId } : {}),
          ...(locationId ? { locationId } : {}),
          ...(campaign ? { campaign } : {}),
          status: 'installed',
          installedAt: new Date(),
          $unset: { uninstalledAt: '' },
        },
        { upsert: true, new: true },
      );

      this.logger.log(
        `Referral tracked: code=${referralCode}, location=${locationId || 'company-level'}`,
      );
    } catch (error) {
      this.logger.error('Failed to track referral', error);
    }
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
