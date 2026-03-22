import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ArchivedTokenDocument = HydratedDocument<ArchivedToken>;

@Schema({ collection: 'archived_tokens', timestamps: true })
export class ArchivedToken {
  @Prop({ index: true })
  companyId: string;

  @Prop({ required: true, index: true })
  locationId: string;

  @Prop({ required: true })
  accessToken: string;

  @Prop({ required: true })
  refreshToken: string;

  @Prop()
  originalCreatedAt: Date;

  @Prop()
  originalExpiresAt: Date;

  @Prop({ default: () => new Date() })
  deletedAt: Date;

  @Prop()
  deletionReason: string;

  @Prop({ type: Object })
  uninstallWebhookData: Record<string, any>;

  @Prop({
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    index: { expires: 0 },
  })
  autoDeleteAt: Date;
}

export const ArchivedTokenSchema = SchemaFactory.createForClass(ArchivedToken);
