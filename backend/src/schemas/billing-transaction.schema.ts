import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class BillingPricing {
  @Prop()
  amount: number;

  @Prop()
  currency: string;

  @Prop()
  meterId: string;
}

export const BillingPricingSchema = SchemaFactory.createForClass(BillingPricing);

export type BillingTransactionDocument = HydratedDocument<BillingTransaction>;

@Schema({ collection: 'billing_transactions', timestamps: true })
export class BillingTransaction {
  @Prop({ required: true, index: true })
  locationId: string;

  @Prop()
  companyId: string;

  @Prop({ required: true, enum: ['message_sync', 'subscription'] })
  type: string;

  @Prop()
  ghlChargeId: string;

  @Prop({ default: 1 })
  units: number;

  @Prop({ type: BillingPricingSchema })
  pricing: BillingPricing;

  @Prop({ default: 'pending', enum: ['pending', 'completed', 'failed'] })
  status: string;

  @Prop()
  referralCode: string;
}

export const BillingTransactionSchema = SchemaFactory.createForClass(BillingTransaction);

BillingTransactionSchema.index({ locationId: 1, createdAt: -1 });
BillingTransactionSchema.index({ companyId: 1, status: 1 });
