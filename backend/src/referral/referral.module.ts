import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { Referral, ReferralSchema } from '../schemas/referral.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Referral.name, schema: ReferralSchema }])],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
