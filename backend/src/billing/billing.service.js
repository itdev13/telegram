const axios = require('axios');
const BillingTransaction = require('../schemas/billing-transaction.schema');
const Referral = require('../schemas/referral.schema');
const Installation = require('../schemas/installation.schema');
const AppConfig = require('../schemas/app-config.schema');

// Default pricing per action type (matches competitor pricing)
const DEFAULT_PRICING = {
  telegram_inbound: 0.01, // $0.01 per inbound message
  telegram_outbound: 0.01, // $0.01 per outbound message
  send_file_to_group: 0.02, // $0.02 per execution
  generate_invite_link: 0.02, // $0.02 per execution
  edit_group_permissions: 0.03, // $0.03 per execution
  send_message_user: 0.02, // $0.02 per execution
  send_message_group: 0.02, // $0.02 per execution
  send_reaction: 0.01, // $0.01 per execution
};

// Meter IDs per action type — placeholder until user creates them in GHL
const METER_IDS = {
  telegram_inbound: process.env.METER_ID_INBOUND || '',
  telegram_outbound: process.env.METER_ID_OUTBOUND || '',
  send_file_to_group: process.env.METER_ID_SEND_FILE_GROUP || '',
  generate_invite_link: process.env.METER_ID_INVITE_LINK || '',
  edit_group_permissions: process.env.METER_ID_EDIT_GROUP_PERMS || '',
  send_message_user: process.env.METER_ID_SEND_MSG_USER || '',
  send_message_group: process.env.METER_ID_SEND_MSG_GROUP || '',
  send_reaction: process.env.METER_ID_SEND_REACTION || '',
};

class BillingService {
  constructor(authService) {
    this.authService = authService;
    this.ghlApiBase = process.env.GHL_API_BASE;
    this.ghlApiVersion = process.env.GHL_API_VERSION;
    this.appId = process.env.GHL_APP_ID;
    if (!this.ghlApiBase) throw new Error('GHL_API_BASE is required');
    if (!this.ghlApiVersion) throw new Error('GHL_API_VERSION is required');
    if (!this.appId) throw new Error('GHL_APP_ID is required');

    // Short-lived cache of live hasFunds results, keyed by companyId, so the gate
    // can do a synchronous funds check on every message without hammering GHL's
    // has-funds API (which would add latency + burn rate limit). TTL kept small so
    // a drained wallet is caught within ~1 check window.
    this._fundsCache = new Map(); // companyId -> { hasFunds, at }
    this._fundsTtlMs = Number(process.env.HAS_FUNDS_CACHE_TTL_MS) || 60_000;

    console.log('[Billing] Service initialized — internal testing company IDs loaded from AppConfig (DB)');
  }

  /**
   * Get the price for an action type
   */
  getActionPrice(actionType) {
    return DEFAULT_PRICING[actionType] || 0;
  }

  /**
   * Get the meter ID for an action type
   */
  getMeterId(actionType) {
    return METER_IDS[actionType] || '';
  }

  /**
   * Check if a company is internal testing (skip billing).
   * Reads from AppConfig collection (cached 5 min).
   */
  async isInternalTesting(companyId) {
    return AppConfig.hasValue('internalTestingCompanyIds', companyId);
  }

  /**
   * Main billing method — charge for a single action execution.
   * Handles: internal testing bypass, GHL wallet charge, transaction recording, referral tracking.
   *
   * @param {Object} params
   * @param {string} params.locationId
   * @param {string} params.companyId
   * @param {string} params.actionType - One of the DEFAULT_PRICING keys
   * @param {number} [params.units=1] - Number of units (usually 1)
   * @returns {Object} { success, transactionId, chargeId, internalTesting }
   */
  async chargeForAction({ locationId, companyId, actionType, units = 1 }) {
    const unitPrice = this.getActionPrice(actionType);
    const meterId = this.getMeterId(actionType);
    const amount = unitPrice * units;

    // Look up referral code for this location (non-blocking)
    let referralCode = null;
    try {
      const installation = await Installation.findOne({ locationId }).lean();
      if (installation?.referralCode) {
        referralCode = installation.referralCode;
      }
    } catch (err) {
      // Silent fail
    }

    // Internal testing — create record but skip actual GHL charge API
    if (await this.isInternalTesting(companyId)) {
      console.log(
        `[Billing] Internal company detected — skipping charge API | companyId=${companyId} locationId=${locationId} action=${actionType} amount=$${amount}`,
      );

      const transaction = await BillingTransaction.create({
        locationId,
        companyId,
        type: actionType,
        ghlChargeId: `test_${Date.now()}`,
        units,
        pricing: { amount, unitPrice, currency: 'USD', meterId },
        status: 'tested',
        internalTesting: true,
        paymentIgnored: true,
        referralCode,
      });

      console.log(
        `[Billing] Internal record created | transactionId=${transaction._id} companyId=${companyId} action=${actionType}`,
      );

      // Still track referral revenue for testing visibility
      await this._trackReferralRevenue(locationId, amount, referralCode);

      return {
        success: true,
        transactionId: transaction._id.toString(),
        chargeId: transaction.ghlChargeId,
        internalTesting: true,
      };
    }

    // Skip charge if meter ID is not configured
    if (!meterId) {
      console.warn(
        `[Billing] Skipping charge — meterId not configured for action "${actionType}". Set METER_ID_* env vars.`,
      );
      return { success: false, error: 'Meter ID not configured' };
    }

    // Create pending transaction
    const transaction = await BillingTransaction.create({
      locationId,
      companyId,
      type: actionType,
      units,
      pricing: { amount, unitPrice, currency: 'USD', meterId },
      status: 'pending',
      referralCode,
    });

    try {
      // Get access token
      const accessToken = await this.authService.getAccessToken(locationId);

      // Charge GHL wallet
      const chargeResult = await this._chargeGhlWallet({
        companyId,
        locationId,
        accessToken,
        meterId,
        units,
        unitPrice,
        eventId: transaction._id.toString(),
      });

      // Update transaction as completed
      transaction.ghlChargeId = chargeResult.chargeId;
      transaction.status = 'completed';
      await transaction.save();

      // A successful charge means the wallet is funded again — clear any prior suspension.
      await this._clearWalletSuspension(locationId);

      // Track referral revenue (non-blocking)
      await this._trackReferralRevenue(locationId, amount, referralCode);

      return {
        success: true,
        transactionId: transaction._id.toString(),
        chargeId: chargeResult.chargeId,
        internalTesting: false,
      };
    } catch (error) {
      // Mark transaction as failed
      transaction.status = 'failed';
      transaction.errorMessage = error.message;
      await transaction.save();

      // If it failed for lack of funds, suspend syncing for this location until recharge.
      if (error.insufficientFunds) {
        await this._suspendWallet(locationId, error.walletScope, error.ghlBody?.message || error.message);
      }

      const ghlBody = error.ghlBody;
      const ghlMsg = (ghlBody?.message || ghlBody?.error || error.message || '').toLowerCase();
      let hint = '';
      if (!meterId) {
        hint = 'Meter ID is empty — set METER_ID_SEND_MSG_USER (or matching env var) and restart.';
      } else if (ghlMsg.includes('does not have enough funds') || ghlMsg.includes('insufficient')) {
        hint = 'Customer wallet has insufficient funds. Top up GHL company wallet.';
      } else if (ghlMsg.includes('event id') || ghlMsg.includes('eventid') || ghlMsg.includes('duplicate')) {
        hint = 'Duplicate eventId — same transaction is being charged twice (race condition).';
      } else if (ghlMsg.includes('meter') && ghlMsg.includes('not found')) {
        hint = 'Meter ID is invalid for this app. Check it matches the meter registered in the Marketplace app dashboard.';
      } else if (ghlMsg.includes('app') && ghlMsg.includes('not found')) {
        hint = 'appId is wrong — check process.env.GHL_APP_ID matches the marketplace app.';
      } else if (error.status === 401 || error.status === 403) {
        hint = 'Auth rejected — OAuth token may be expired or company-token has no billing scope.';
      } else if (error.status === 402) {
        hint = 'Payment required — GHL says the company has no payment method or wallet balance.';
      } else {
        hint = 'Unrecognized GHL response — inspect the body above. May be schema/validation issue.';
      }

      console.error(
        `[Billing] Charge failed for ${actionType} at location ${locationId}\n` +
        `  ${error.message}\n` +
        `  Hint: ${hint}`
      );

      return {
        success: false,
        transactionId: transaction._id.toString(),
        error: error.message,
        hint,
      };
    }
  }

  /**
   * POST charge to GHL marketplace billing API
   */
  async _chargeGhlWallet({ companyId, locationId, accessToken, meterId, units, unitPrice, eventId }) {
    const requestBody = {
      companyId,
      locationId,
      meterId,
      units,
      price: unitPrice,
      appId: this.appId,
      eventId,
      description: `TeleSync charge_${new Date().toDateString()}`,
    };

    try {
      const res = await axios.post(
        `${this.ghlApiBase}/marketplace/billing/charges`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Version: this.ghlApiVersion,
            'Content-Type': 'application/json',
          },
        },
      );
      return { chargeId: res.data?.chargeId || res.data?.id || res.data?._id };
    } catch (error) {
      // axios errors have generic .message ("Request failed with status code 400") —
      // the real reason is in error.response.data. Surface it.
      const status = error.response?.status;
      const ghlBody = error.response?.data;
      const ghlMsg = ghlBody?.message || ghlBody?.error || (typeof ghlBody === 'string' ? ghlBody : '');

      const enriched = new Error(
        `GHL billing rejected: HTTP ${status || '?'} — ${ghlMsg || error.message}\n` +
        `  Request: { companyId: ${companyId}, locationId: ${locationId}, meterId: ${meterId || '(missing)'}, units: ${units}, price: ${unitPrice}, appId: ${this.appId || '(missing)'}, eventId: ${eventId} }\n` +
        `  Response body: ${ghlBody ? JSON.stringify(ghlBody) : '(empty)'}`
      );
      enriched.status = status;
      enriched.ghlBody = ghlBody;
      // Detect insufficient-funds so callers can suspend syncing and the UI can prompt a recharge.
      const lowerMsg = (ghlMsg || '').toLowerCase();
      enriched.insufficientFunds = /insufficient|not enough funds|low balance/i.test(lowerMsg);
      enriched.walletScope = /agency/i.test(lowerMsg) ? 'agency'
        : /location|sub-?account/i.test(lowerMsg) ? 'location'
        : null;
      throw enriched;
    }
  }

  /**
   * Suspend syncing for a location after an insufficient-funds charge failure.
   */
  async _suspendWallet(locationId, walletScope, message) {
    try {
      await Installation.updateOne(
        { locationId },
        {
          walletStatus: 'insufficient',
          walletScope: walletScope || null,
          walletMessage: message || 'Wallet has insufficient funds',
          walletUpdatedAt: new Date(),
        },
      );
      console.warn(`[Billing] Location ${locationId} suspended — wallet insufficient (${walletScope || 'unknown'})`);
      // Drop any cached "has funds" so the gate reflects the suspension immediately.
      await this._invalidateFundsForLocation(locationId);
    } catch (err) {
      console.error(`[Billing] Failed to set wallet suspension for ${locationId} | ${err.message}`);
    }
  }

  /** Invalidate cached funds for the company owning this location (best-effort). */
  async _invalidateFundsForLocation(locationId) {
    try {
      const inst = await Installation.findOne({ locationId }).select('companyId').lean();
      this._invalidateFundsCache(inst?.companyId);
    } catch {
      // Non-critical.
    }
  }

  /**
   * Clear a prior wallet suspension (called after a successful charge).
   */
  async _clearWalletSuspension(locationId) {
    try {
      const result = await Installation.updateOne(
        { locationId, walletStatus: 'insufficient' },
        { walletStatus: 'ok', walletScope: null, walletMessage: '', walletUpdatedAt: new Date() },
      );
      // Drop any cached "no funds" so the next message re-checks live.
      await this._invalidateFundsForLocation(locationId);
      return result.modifiedCount > 0;
    } catch {
      // Non-critical.
      return false;
    }
  }

  /**
   * Gate for message sync. Returns { allowed, status, scope, message }.
   * Blocks sync when the location is currently suspended for insufficient funds.
   * Internal-testing companies are always allowed.
   */
  async isSyncAllowed(locationId, companyId) {
    if (companyId && (await this.isInternalTesting(companyId))) {
      return { allowed: true, status: 'ok' };
    }

    // Step 1: fast path — persisted suspension (no API call).
    let effectiveCompanyId = companyId;
    try {
      const inst = await Installation.findOne({ locationId })
        .select('companyId walletStatus walletScope walletMessage')
        .lean();
      effectiveCompanyId = companyId || inst?.companyId;
      if (inst?.walletStatus === 'insufficient') {
        return {
          allowed: false,
          status: 'insufficient',
          scope: inst.walletScope || null,
          message: inst.walletMessage || 'Wallet has insufficient funds',
        };
      }
    } catch (err) {
      // On lookup failure, fail open (don't block delivery on our own DB error).
      console.error(`[Billing] isSyncAllowed lookup failed for ${locationId} | ${err.message}`);
      return { allowed: true, status: 'ok' };
    }

    // Step 2: live (cached) funds check — closes the one-message-slip where a
    // wallet drains but walletStatus hasn't flipped yet. null = undetermined → allow.
    const hasFunds = await this._hasFundsCached(effectiveCompanyId, locationId);
    if (hasFunds === false) {
      // Persist so the UI banner shows and later checks are instant. Scope unknown
      // from has-funds (boolean only) — a failed charge later fills in agency/location.
      await this._suspendWallet(locationId, null, 'Wallet has insufficient funds');
      return {
        allowed: false,
        status: 'insufficient',
        scope: null,
        message: 'Wallet has insufficient funds',
      };
    }

    return { allowed: true, status: 'ok' };
  }

  /**
   * Read the persisted wallet status for a location (for the UI banner).
   */
  async getWalletStatus(locationId) {
    const inst = await Installation.findOne({ locationId })
      .select('walletStatus walletScope walletMessage walletUpdatedAt')
      .lean();
    return {
      walletStatus: inst?.walletStatus || 'ok',
      walletScope: inst?.walletScope || null,
      walletMessage: inst?.walletMessage || '',
      walletUpdatedAt: inst?.walletUpdatedAt || null,
    };
  }

  /**
   * Track referral revenue (non-blocking)
   */
  async _trackReferralRevenue(locationId, amount, referralCode) {
    try {
      if (!referralCode) return;
      await Referral.updateMany(
        { locationId, referralCode, status: 'installed' },
        {
          $inc: { totalCharges: amount, totalMessagesSynced: 1 },
        },
      );
    } catch (err) {
      // Silent fail — referral tracking should never block billing
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Existing utility methods
  // ═══════════════════════════════════════════════════════════

  async hasFunds(companyId, accessToken) {
    if (await this.isInternalTesting(companyId)) {
      console.log(`[Billing] Internal company ${companyId} — hasFunds bypassed (always true)`);
      return true;
    }

    try {
      const res = await axios.get(`${this.ghlApiBase}/marketplace/billing/charges/has-funds`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: this.ghlApiVersion,
        },
      });
      return res.data?.hasFunds ?? false;
    } catch (error) {
      console.error(`Failed to check funds for company ${companyId}`, error.message);
      return false;
    }
  }

  /**
   * Cached live funds check for the sync gate. Returns null if it couldn't be
   * determined (no companyId / token fetch failed) so the caller can fail open.
   * Positive AND negative results are cached briefly per company.
   */
  async _hasFundsCached(companyId, locationId) {
    if (!companyId) return null;

    const cached = this._fundsCache.get(companyId);
    if (cached && Date.now() - cached.at < this._fundsTtlMs) {
      return cached.hasFunds;
    }

    let accessToken;
    try {
      accessToken = await this.authService.getAccessToken(locationId);
    } catch (err) {
      console.error(`[Billing] hasFunds token fetch failed for ${locationId} | ${err.message}`);
      return null; // fail open — don't block on our own auth error
    }

    const hasFunds = await this.hasFunds(companyId, accessToken);
    this._fundsCache.set(companyId, { hasFunds, at: Date.now() });
    return hasFunds;
  }

  /** Invalidate the cached funds result for a company (e.g. after a charge). */
  _invalidateFundsCache(companyId) {
    if (companyId) this._fundsCache.delete(companyId);
  }

  async fetchMeterPrices(accessToken, locationId) {
    try {
      const res = await axios.get(
        `${this.ghlApiBase}/marketplace/app/${this.appId}/rebilling-config/location/${locationId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Version: this.ghlApiVersion,
          },
        },
      );
      return res.data;
    } catch (error) {
      console.error(`Failed to fetch meter prices for location ${locationId}`, error.message);
      return null;
    }
  }

  async getTransactions(locationId, limit = 50, skip = 0) {
    return BillingTransaction.find({ locationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  /**
   * Get pricing config for display
   */
  getPricingConfig() {
    return {
      pricing: DEFAULT_PRICING,
      meterIds: METER_IDS,
    };
  }
}

module.exports = BillingService;
