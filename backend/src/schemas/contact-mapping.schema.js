const mongoose = require('mongoose');

const ContactMappingSchema = new mongoose.Schema(
  {
    locationId: { type: String, required: true, index: true },
    telegramChatId: { type: Number, required: true },
    ghlContactId: { type: String, required: true },
    telegramUsername: { type: String },
    telegramFirstName: { type: String, required: true },
    source: { type: String, enum: ['bot', 'phone'], default: 'bot' },
    connectionId: { type: String, default: '' },
  },
  { collection: 'contact_mappings', timestamps: { createdAt: true, updatedAt: false } },
);

ContactMappingSchema.index({ locationId: 1, telegramChatId: 1 }, { unique: true });
ContactMappingSchema.index({ locationId: 1, ghlContactId: 1 });

module.exports = mongoose.model('ContactMapping', ContactMappingSchema);
