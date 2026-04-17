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

      console.error(
        `[Billing] Charge failed for ${actionType} at location ${locationId}: ${error.message}`,
      );

      return {
        success: false,
        transactionId: transaction._id.toString(),
        error: error.message,
      };
    }
  }

  /**
   * POST charge to GHL marketplace billing API
   */
  async _chargeGhlWallet({ companyId, locationId, accessToken, meterId, units, unitPrice, eventId }) {
    const res = await axios.post(
      `${this.ghlApiBase}/marketplace/billing/charges`,
      {
        companyId,
        locationId,
        meterId,
        units,
        price: unitPrice,
        appId: this.appId,
        eventId,
        description: `TeleSync charge_${new Date().toDateString()}`,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: this.ghlApiVersion,
          'Content-Type': 'application/json',
        },
      },
    );

    return { chargeId: res.data?.chargeId || res.data?.id || res.data?._id };
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
