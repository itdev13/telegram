import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Referral, ReferralDocument } from '../schemas/referral.schema';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    @InjectModel(Referral.name)
    private referralModel: Model<ReferralDocument>,
    private config: ConfigService,
  ) {}

  async getStats(): Promise<any> {
    const stats = await this.referralModel.aggregate([
      {
        $group: {
          _id: '$referralCode',
          totalInstalls: { $sum: 1 },
          activeInstalls: {
            $sum: { $cond: [{ $eq: ['$status', 'installed'] }, 1, 0] },
          },
          uninstalled: {
            $sum: { $cond: [{ $eq: ['$status', 'uninstalled'] }, 1, 0] },
          },
          totalCharges: { $sum: '$totalCharges' },
          totalMessagesSynced: { $sum: '$totalMessagesSynced' },
          influencer: { $first: '$influencer' },
        },
      },
      { $sort: { totalInstalls: -1 } },
    ]);

    return stats;
  }

  async getInstallsByCode(referralCode: string): Promise<ReferralDocument[]> {
    return this.referralModel.find({ referralCode }).sort({ installedAt: -1 }).exec();
  }

  async registerInfluencer(
    referralCode: string,
    influencer: {
      name: string;
      email: string;
      payoutMethod?: string;
      payoutDetails?: string;
    },
  ): Promise<ReferralDocument> {
    // Update all referrals with this code to include influencer info
    await this.referralModel.updateMany({ referralCode }, { influencer });

    // Also upsert a "base" record for the influencer if no installs yet
    return this.referralModel.findOneAndUpdate(
      { referralCode, locationId: { $exists: false }, companyId: { $exists: false } },
      {
        referralCode,
        influencer,
        status: 'registered',
      },
      { upsert: true, new: true },
    );
  }

  async generateInstallLink(referralCode: string, campaign?: string): Promise<string> {
    const baseUrl = this.config.getOrThrow('APP_BASE_URL');
    const params = new URLSearchParams({ ref: referralCode });
    if (campaign) params.set('campaign', campaign);
    return `${baseUrl}/auth/authorize?${params.toString()}`;
  }
}
