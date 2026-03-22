import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhooksController } from './webhooks.controller';
import { SettingsModule } from '../settings/settings.module';
import { TelegramModule } from '../telegram/telegram.module';
import { GhlModule } from '../ghl/ghl.module';
import { ContactMappingModule } from '../contact-mapping/contact-mapping.module';
import { AuthModule } from '../auth/auth.module';
import { Installation, InstallationSchema } from '../schemas/installation.schema';
import { MessageLog, MessageLogSchema } from '../schemas/message-log.schema';
import { ContactMapping, ContactMappingSchema } from '../schemas/contact-mapping.schema';
import { ArchivedToken, ArchivedTokenSchema } from '../schemas/archived-token.schema';
import { CompanyToken, CompanyTokenSchema } from '../schemas/company-token.schema';
import { CompanyLocation, CompanyLocationSchema } from '../schemas/company-location.schema';
import { Referral, ReferralSchema } from '../schemas/referral.schema';

@Module({
  imports: [
    SettingsModule,
    TelegramModule,
    GhlModule,
    ContactMappingModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: Installation.name, schema: InstallationSchema },
      { name: MessageLog.name, schema: MessageLogSchema },
      { name: ContactMapping.name, schema: ContactMappingSchema },
      { name: ArchivedToken.name, schema: ArchivedTokenSchema },
      { name: CompanyToken.name, schema: CompanyTokenSchema },
      { name: CompanyLocation.name, schema: CompanyLocationSchema },
      { name: Referral.name, schema: ReferralSchema },
    ]),
  ],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
