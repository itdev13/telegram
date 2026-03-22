import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CompanyLocationDocument = HydratedDocument<CompanyLocation>;

@Schema({ collection: 'company_locations', timestamps: true })
export class CompanyLocation {
  @Prop({ required: true, unique: true, index: true })
  companyId: string;

  @Prop({ type: [String], default: [] })
  locationIds: string[];

  static findCompanyByLocation(
    model: any,
    locationId: string,
  ): Promise<CompanyLocationDocument | null> {
    return model.findOne({ locationIds: locationId });
  }
}

export const CompanyLocationSchema = SchemaFactory.createForClass(CompanyLocation);
