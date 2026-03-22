import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class Influencer {
  @Prop()
  name: string;

  @Prop()
  email: string;

  @Prop()
  payoutMethod: string;

  @Prop()
  payoutDetails: string;
}

export const InfluencerSchema = SchemaFactory.createForClass(Influencer);

export type ReferralDocument = HydratedDocument<Referral>;

@Schema({ collection: 'referrals', timestamps: true })
export class Referral {
  @Prop({ required: true, index: true })
  referralCode: string;

  @Prop({ default: false })
  testing: boolean;

  @Prop({ type: InfluencerSchema, default: null })
  influencer: Influencer | null;

  @Prop()
  companyId: string;

  @Prop()
  locationId: string;

  @Prop()
  campaign: string;

  @Prop({ default: 'installed' })
  status: string;

  @Prop({ default: 0 })
  totalCharges: number;

  @Prop({ default: 0 })
  totalMessagesSynced: number;

  @Prop()
  installedAt: Date;

  @Prop()
  uninstalledAt: Date;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);

ReferralSchema.index({ referralCode: 1, status: 1 });
ReferralSchema.index({ companyId: 1, locationId: 1 });
