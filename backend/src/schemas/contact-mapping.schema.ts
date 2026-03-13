import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContactMappingDocument = HydratedDocument<ContactMapping>;

@Schema({ collection: 'contact_mappings', timestamps: { createdAt: true, updatedAt: false } })
export class ContactMapping {
  @Prop({ required: true, index: true })
  locationId: string;

  @Prop({ required: true })
  telegramChatId: number;

  @Prop({ required: true })
  ghlContactId: string;

  @Prop()
  telegramUsername?: string;

  @Prop({ required: true })
  telegramFirstName: string;
}

export const ContactMappingSchema = SchemaFactory.createForClass(ContactMapping);

// Compound unique index: one mapping per (locationId, telegramChatId)
ContactMappingSchema.index({ locationId: 1, telegramChatId: 1 }, { unique: true });

// Performance index for outbound lookups by ghlContactId
ContactMappingSchema.index({ locationId: 1, ghlContactId: 1 });
