const mongoose = require('mongoose');

const InfluencerSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String },
    payoutMethod: { type: String },
    payoutDetails: { type: String },
  },
  { _id: false },
);

const ReferralSchema = new mongoose.Schema(
  {
    referralCode: { type: String, required: true, index: true },
    testing: { type: Boolean, default: false },
    influencer: { type: InfluencerSchema, default: null },
    companyId: { type: String },
    locationId: { type: String },
    campaign: { type: String },
    status: { type: String, default: 'installed' },
    totalCharges: { type: Number, default: 0 },
    totalMessagesSynced: { type: Number, default: 0 },
    installedAt: { type: Date },
    uninstalledAt: { type: Date },
  },
  { collection: 'referrals', timestamps: true },
);

ReferralSchema.index({ referralCode: 1, status: 1 });
ReferralSchema.index({ companyId: 1, locationId: 1 });

module.exports = mongoose.model('Referral', ReferralSchema);
