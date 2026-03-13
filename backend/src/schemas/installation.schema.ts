import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// ── Embedded subdocument: TelegramConfig ──────────────

@Schema({ _id: false })
export class TelegramConfig {
  @Prop({ required: true })
  botToken: string;

  @Prop({ required: true })
  botUsername: string;

  @Prop({ required: true })
  botId: number;

  @Prop({ required: true })
  webhookSecret: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export const TelegramConfigSchema = SchemaFactory.createForClass(TelegramConfig);

// ── Main document: Installation ───────────────────────

export type InstallationDocument = HydratedDocument<Installation>;

@Schema({ collection: 'installations', timestamps: true })
export class Installation {
  @Prop({ required: true })
  companyId: string;

  @Prop({ required: true, unique: true, index: true })
  locationId: string;

  @Prop({ required: true })
  accessToken: string;

  @Prop({ required: true })
  refreshToken: string;

  @Prop({ required: true })
  tokenExpiresAt: Date;

  @Prop({ default: '' })
  conversationProviderId: string;

  @Prop({ type: TelegramConfigSchema, default: null })
  telegramConfig: TelegramConfig | null;
}

export const InstallationSchema = SchemaFactory.createForClass(Installation);
