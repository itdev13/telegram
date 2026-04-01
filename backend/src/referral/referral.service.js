const Referral = require('../schemas/referral.schema');

class ReferralService {
  async getStats() {
    const stats = await Referral.aggregate([
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

  async getInstallsByCode(referralCode) {
    return Referral.find({ referralCode }).sort({ installedAt: -1 }).exec();
  }

  async registerInfluencer(referralCode, influencer) {
    await Referral.updateMany({ referralCode }, { influencer });

    return Referral.findOneAndUpdate(
      { referralCode, locationId: { $exists: false }, companyId: { $exists: false } },
      {
        referralCode,
        influencer,
        status: 'registered',
      },
      { upsert: true, new: true },
    );
  }

  async generateInstallLink(referralCode, campaign) {
    const baseUrl = process.env.APP_BASE_URL;
    const params = new URLSearchParams({ ref: referralCode });
    if (campaign) params.set('campaign', campaign);
    return `${baseUrl}/auth/authorize?${params.toString()}`;
  }
}

module.exports = ReferralService;
