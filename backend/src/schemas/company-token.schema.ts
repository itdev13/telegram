import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CompanyTokenDocument = HydratedDocument<CompanyToken>;

@Schema({ collection: 'company_tokens', timestamps: true })
export class CompanyToken {
  @Prop({ required: true, unique: true, index: true })
  companyId: string;

  @Prop({ required: true })
  accessToken: string;

  @Prop({ required: true })
  refreshToken: string;

  @Prop({ required: true })
  tokenExpiresAt: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const CompanyTokenSchema = SchemaFactory.createForClass(CompanyToken);
