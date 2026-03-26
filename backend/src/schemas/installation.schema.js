const mongoose = require('mongoose');

const TelegramConfigSchema = new mongoose.Schema(
  {
    botToken: { type: String, required: true },
    botUsername: { type: String, required: true },
    botId: { type: Number, required: true },
    webhookSecret: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const InstallationSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true },
    locationId: { type: String, required: true, unique: true, index: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    tokenExpiresAt: { type: Date, required: true },
    status: { type: String, default: 'active', index: true },
    installedAt: { type: Date },
    uninstalledAt: { type: Date },
    referralCode: { type: String },
    conversationProviderId: { type: String, default: '' },
    telegramConfig: { type: TelegramConfigSchema, default: null },
  },
  { collection: 'installations', timestamps: true },
);

module.exports = mongoose.model('Installation', InstallationSchema);
