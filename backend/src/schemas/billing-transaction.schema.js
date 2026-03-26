const mongoose = require('mongoose');

const BillingPricingSchema = new mongoose.Schema(
  {
    amount: { type: Number },
    currency: { type: String },
    meterId: { type: String },
  },
  { _id: false },
);

const BillingTransactionSchema = new mongoose.Schema(
  {
    locationId: { type: String, required: true, index: true },
    companyId: { type: String },
    type: { type: String, required: true, enum: ['message_sync', 'subscription'] },
    ghlChargeId: { type: String },
    units: { type: Number, default: 1 },
    pricing: { type: BillingPricingSchema },
    status: { type: String, default: 'pending', enum: ['pending', 'completed', 'failed'] },
    referralCode: { type: String },
  },
  { collection: 'billing_transactions', timestamps: true },
);

BillingTransactionSchema.index({ locationId: 1, createdAt: -1 });
BillingTransactionSchema.index({ companyId: 1, status: 1 });

module.exports = mongoose.model('BillingTransaction', BillingTransactionSchema);
