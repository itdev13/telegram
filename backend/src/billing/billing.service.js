const axios = require('axios');
const BillingTransaction = require('../schemas/billing-transaction.schema');

class BillingService {
  constructor(authService) {
    this.authService = authService;
    this.ghlApiBase = process.env.GHL_API_BASE;
    this.ghlApiVersion = process.env.GHL_API_VERSION;
    this.appId = process.env.GHL_APP_ID;
    if (!this.ghlApiBase) throw new Error('GHL_API_BASE is required');
    if (!this.ghlApiVersion) throw new Error('GHL_API_VERSION is required');
    if (!this.appId) throw new Error('GHL_APP_ID is required');
    this.internalTestingCompanyIds = (process.env.INTERNAL_TESTING_COMPANY_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  async hasFunds(companyId, accessToken) {
    if (this.internalTestingCompanyIds.includes(companyId)) {
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
      console.error(`Failed to check funds for company ${companyId}`, error);
      return false;
    }
  }

  async chargeWallet(params) {
    if (this.internalTestingCompanyIds.includes(params.companyId)) {
      return { chargeId: `test_${Date.now()}` };
    }

    try {
      const res = await axios.post(
        `${this.ghlApiBase}/marketplace/billing/charges`,
        {
          companyId: params.companyId,
          locationId: params.locationId,
          amount: params.amount,
          description: params.description,
          ...(params.meterId ? { meterId: params.meterId } : {}),
          ...(params.units ? { units: params.units } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
            Version: this.ghlApiVersion,
            'Content-Type': 'application/json',
          },
        },
      );

      return { chargeId: res.data?.chargeId || res.data?.id };
    } catch (error) {
      console.error('Failed to charge wallet', error);
      return null;
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
      console.error(`Failed to fetch meter prices for location ${locationId}`, error);
      return null;
    }
  }

  async recordTransaction(dto) {
    return BillingTransaction.create(dto);
  }

  async getTransactions(locationId, limit = 50, skip = 0) {
    return BillingTransaction.find({ locationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }
}

module.exports = BillingService;
