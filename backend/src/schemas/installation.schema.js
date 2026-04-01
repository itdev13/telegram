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

const PhoneConfigSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true },
    sessionString: { type: String, required: true },
    telegramUserId: { type: String },
    telegramUsername: { type: String },
    displayName: { type: String },
    isActive: { type: Boolean, default: true },
    lastActivityAt: { type: Date },
    connectedAt: { type: Date, default: () => new Date() },
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
    connectionType: { type: String, enum: ['bot', 'phone'], default: 'bot' },
    telegramConfig: { type: TelegramConfigSchema, default: null },
    phoneConfig: { type: PhoneConfigSchema, default: null },
  },
  { collection: 'installations', timestamps: true },
);

InstallationSchema.index({ connectionType: 1, 'phoneConfig.isActive': 1 });

module.exports = mongoose.model('Installation', InstallationSchema);
