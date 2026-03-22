import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  BillingTransaction,
  BillingTransactionDocument,
} from '../schemas/billing-transaction.schema';
import { AuthService } from '../auth/auth.service';
import { BillingTransactionData } from '../common/interfaces';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly ghlApiBase: string;
  private readonly ghlApiVersion: string;
  private readonly appId: string;
  private readonly internalTestingCompanyIds: string[];

  constructor(
    @InjectModel(BillingTransaction.name)
    private billingTransactionModel: Model<BillingTransactionDocument>,
    private authService: AuthService,
    private config: ConfigService,
  ) {
    this.ghlApiBase = this.config.getOrThrow('GHL_API_BASE');
    this.ghlApiVersion = this.config.getOrThrow('GHL_API_VERSION');
    this.appId = this.config.getOrThrow('GHL_APP_ID');
    this.internalTestingCompanyIds = (this.config.get('INTERNAL_TESTING_COMPANY_IDS') || '')
      .split(',')
      .map((id: string) => id.trim())
      .filter(Boolean);
  }

  async hasFunds(companyId: string, accessToken: string): Promise<boolean> {
    // Skip billing for internal testing companies
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
      this.logger.error(`Failed to check funds for company ${companyId}`, error);
      return false;
    }
  }

  async chargeWallet(params: {
    accessToken: string;
    companyId: string;
    locationId: string;
    amount: number;
    description: string;
    meterId?: string;
    units?: number;
  }): Promise<{ chargeId: string } | null> {
    // Skip billing for internal testing companies
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
      this.logger.error('Failed to charge wallet', error);
      return null;
    }
  }

  async fetchMeterPrices(accessToken: string, locationId: string): Promise<any> {
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
      this.logger.error(`Failed to fetch meter prices for location ${locationId}`, error);
      return null;
    }
  }

  async recordTransaction(dto: BillingTransactionData): Promise<BillingTransactionDocument> {
    return this.billingTransactionModel.create(dto);
  }

  async getTransactions(
    locationId: string,
    limit = 50,
    skip = 0,
  ): Promise<BillingTransactionDocument[]> {
    return this.billingTransactionModel
      .find({ locationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }
}
