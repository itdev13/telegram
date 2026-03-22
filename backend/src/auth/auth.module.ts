import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SsoGuard } from './guards/sso.guard';
import { Installation, InstallationSchema } from '../schemas/installation.schema';
import { CompanyToken, CompanyTokenSchema } from '../schemas/company-token.schema';
import { CompanyLocation, CompanyLocationSchema } from '../schemas/company-location.schema';
import { Referral, ReferralSchema } from '../schemas/referral.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Installation.name, schema: InstallationSchema },
      { name: CompanyToken.name, schema: CompanyTokenSchema },
      { name: CompanyLocation.name, schema: CompanyLocationSchema },
      { name: Referral.name, schema: ReferralSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, SsoGuard],
  exports: [AuthService, SsoGuard],
})
export class AuthModule {}
