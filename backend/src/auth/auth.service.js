const axios = require('axios');
const Installation = require('../schemas/installation.schema');
const CompanyToken = require('../schemas/company-token.schema');
const CompanyLocation = require('../schemas/company-location.schema');
const Referral = require('../schemas/referral.schema');

class AuthService {
  constructor(cryptoService) {
    this.crypto = cryptoService;
    this.ghlApiBase = process.env.GHL_API_BASE;
    if (!this.ghlApiBase) throw new Error('GHL_API_BASE is required');
  }

  // ── OAuth: Exchange authorization code for tokens ──────────

  async handleOAuthCallback(code, state) {
    console.log(`OAuth token exchange starting for code: ${code.substring(0, 8)}...`);
    console.log(`Using redirect_uri: ${process.env.GHL_REDIRECT_URI}`);
    console.log(`Using client_id: ${process.env.GHL_CLIENT_ID.substring(0, 8)}...`);

    let tokenResponse;
    try {
      tokenResponse = await axios.post(
        `${this.ghlApiBase}/oauth/token`,
        new URLSearchParams({
          client_id: process.env.GHL_CLIENT_ID,
          client_secret: process.env.GHL_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.GHL_REDIRECT_URI,
        }),
      );
      console.log(
        `Token exchange successful, got locationId=${tokenResponse.data.locationId}, companyId=${tokenResponse.data.companyId}`,
      );
    } catch (error) {
      console.error(
        `Token exchange failed: status=${error?.response?.status}, data=${JSON.stringify(error?.response?.data)}`,
      );
      throw error;
    }

    const { access_token, refresh_token, expires_in, locationId, companyId } = tokenResponse.data;

    // Decode referral state if present
    let referralData = {};
    if (state) {
      try {
        referralData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      } catch {
        console.warn('Failed to decode OAuth state parameter');
      }
    }

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    if (locationId) {
      // ── Location-level install ──
      await Installation.findOneAndUpdate(
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
            conversationProviderId: process.env.GHL_CONVERSATION_PROVIDER_ID || '',
          },
        },
        { upsert: true, new: true },
      );

      console.log(`OAuth tokens stored for location: ${locationId}`);

      // Track referral if present
      if (referralData.ref) {
        await this._upsertReferral(referralData.ref, companyId, locationId, referralData.campaign);
      }
    } else if (companyId) {
      // ── Company-level install ──
      await CompanyToken.findOneAndUpdate(
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

      console.log(`Company-level OAuth tokens stored for company: ${companyId}`);

      // Fetch and store all sub-account location IDs
      try {
        const locations = await this._getCompanyLocations(access_token, companyId);
        const locationIds = locations.map((loc) => loc.id);

        await CompanyLocation.findOneAndUpdate(
          { companyId },
          { companyId, locationIds },
          { upsert: true, new: true },
        );

        console.log(`Stored ${locationIds.length} locations for company: ${companyId}`);
      } catch (error) {
        console.error(`Failed to fetch company locations for ${companyId}`, error);
      }

      // Track referral if present
      if (referralData.ref) {
        await this._upsertReferral(referralData.ref, companyId, undefined, referralData.campaign);
      }
    } else {
      throw new Error('OAuth response missing both locationId and companyId');
    }
  }

  // ── Fetch company locations ──────────────────────────────

  async _getCompanyLocations(accessToken, companyId) {
    const apiVersion = process.env.GHL_API_VERSION;
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

  async generateLocationToken(companyId, locationId) {
    const companyToken = await CompanyToken.findOne({
      companyId,
      isActive: true,
    });

    if (!companyToken) {
      const err = new Error(`No active company token for company: ${companyId}`);
      err.statusCode = 401;
      throw err;
    }

    // Refresh company token if expiring within 5 minutes
    let accessToken = this.crypto.decrypt(companyToken.accessToken);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    if (companyToken.tokenExpiresAt < fiveMinutesFromNow) {
      accessToken = await this._refreshCompanyToken(companyId);
    }

    try {
      const res = await axios.post(
        `${this.ghlApiBase}/oauth/locationToken`,
        { companyId, locationId },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Version: process.env.GHL_API_VERSION,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log(`Location token generated for ${locationId} from company ${companyId}`);

      return {
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
        expiresIn: res.data.expires_in,
      };
    } catch (error) {
      console.error(
        `Failed to generate location token for ${locationId} from company ${companyId}` +
          ` | Status: ${error?.response?.status}` +
          ` | Response: ${JSON.stringify(error?.response?.data)}`,
      );
      throw error;
    }
  }

  // ── Refresh company-level token ──

  async _refreshCompanyToken(companyId) {
    const companyToken = await CompanyToken.findOne({ companyId });
    if (!companyToken) {
      const err = new Error(`No company token for: ${companyId}`);
      err.statusCode = 401;
      throw err;
    }

    const refreshToken = this.crypto.decrypt(companyToken.refreshToken);

    const tokenResponse = await axios.post(
      `${this.ghlApiBase}/oauth/token`,
      new URLSearchParams({
        client_id: process.env.GHL_CLIENT_ID,
        client_secret: process.env.GHL_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );

    const { access_token, refresh_token: newRefreshToken, expires_in } = tokenResponse.data;

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await CompanyToken.updateOne(
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

  async refreshAccessToken(locationId) {
    const installation = await Installation.findOne({ locationId });

    if (!installation) {
      const err = new Error(`No installation found for location: ${locationId}`);
      err.statusCode = 401;
      throw err;
    }

    const refreshToken = this.crypto.decrypt(installation.refreshToken);

    try {
      const tokenResponse = await axios.post(
        `${this.ghlApiBase}/oauth/token`,
        new URLSearchParams({
          client_id: process.env.GHL_CLIENT_ID,
          client_secret: process.env.GHL_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      );

      const { access_token, refresh_token: newRefreshToken, expires_in } = tokenResponse.data;

      const expiresAt = new Date(Date.now() + expires_in * 1000);

      await Installation.updateOne(
        { locationId },
        {
          accessToken: this.crypto.encrypt(access_token),
          refreshToken: this.crypto.encrypt(newRefreshToken),
          tokenExpiresAt: expiresAt,
        },
      );

      return access_token;
    } catch (error) {
      // Race condition handling: if another process already refreshed
      if (error?.response?.data?.error === 'invalid_grant') {
        console.warn(
          `invalid_grant for ${locationId}, checking if token was refreshed by another process`,
        );

        const freshInstallation = await Installation.findOne({ locationId });
        if (freshInstallation && freshInstallation.accessToken !== installation.accessToken) {
          console.log(`Token was refreshed by another process for ${locationId}`);
          return this.crypto.decrypt(freshInstallation.accessToken);
        }
      }

      throw error;
    }
  }

  // ── Get valid access token (auto-refresh, company fallback) ──

  async getAccessToken(locationId) {
    // Step 1: Check for active installation
    const installation = await Installation.findOne({
      locationId,
      $or: [{ status: 'active' }, { status: { $exists: false } }],
    });

    if (installation && installation.accessToken) {
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
      if (installation.tokenExpiresAt && installation.tokenExpiresAt < fiveMinutesFromNow) {
        console.log(`Token expired for ${locationId}, refreshing...`);
        return this.refreshAccessToken(locationId);
      }
      return this.crypto.decrypt(installation.accessToken);
    }

    // Step 2: No tokens — try company token fallback to generate location token
    const companyLocation = await CompanyLocation.findOne({
      locationIds: locationId,
    });

    if (companyLocation) {
      console.log(
        `No valid token for ${locationId}, generating from company ${companyLocation.companyId}`,
      );

      const locationToken = await this.generateLocationToken(
        companyLocation.companyId,
        locationId,
      );

      const expiresAt = new Date(Date.now() + locationToken.expiresIn * 1000);

      // Update or create installation record with generated token
      await Installation.findOneAndUpdate(
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
            conversationProviderId: process.env.GHL_CONVERSATION_PROVIDER_ID || '',
          },
        },
        { upsert: true, new: true },
      );

      return locationToken.accessToken;
    }

    const err = new Error(`No installation for location: ${locationId}`);
    err.statusCode = 401;
    throw err;
  }

  // ── Upsert referral record ──

  async _upsertReferral(referralCode, companyId, locationId, campaign) {
    try {
      const filter = { referralCode };
      if (locationId) filter.locationId = locationId;
      else if (companyId) filter.companyId = companyId;

      await Referral.findOneAndUpdate(
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

      console.log(
        `Referral tracked: code=${referralCode}, location=${locationId || 'company-level'}`,
      );
    } catch (error) {
      console.error('Failed to track referral', error);
    }
  }

  // ── SSO: Decrypt Custom Page SSO payload ───────────────────

  decryptSsoPayload(encryptedPayload) {
    try {
      return this.crypto.decryptSsoPayload(encryptedPayload);
    } catch (error) {
      console.error('SSO decryption failed', error);
      const err = new Error('Invalid or expired SSO session');
      err.statusCode = 401;
      throw err;
    }
  }
}

module.exports = AuthService;
