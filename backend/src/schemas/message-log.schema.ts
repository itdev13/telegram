import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MessageLogDocument = HydratedDocument<MessageLog>;

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

@Schema({ collection: 'message_logs', timestamps: { createdAt: true, updatedAt: false } })
export class MessageLog {
  @Prop({ required: true, index: true })
  locationId: string;

  @Prop({ required: true, enum: MessageDirection })
  direction: MessageDirection;

  @Prop({ required: true })
  telegramChatId: number;

  @Prop()
  ghlMessageId?: string;

  @Prop()
  telegramMessageId?: number;

  @Prop({ required: true, enum: MessageStatus })
  status: MessageStatus;

  @Prop()
  errorMessage?: string;
}

export const MessageLogSchema = SchemaFactory.createForClass(MessageLog);

// Performance index for querying logs by location and time
MessageLogSchema.index({ locationId: 1, createdAt: -1 });
