import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { TelegramModule } from './telegram/telegram.module';
import { GhlModule } from './ghl/ghl.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ContactMappingModule } from './contact-mapping/contact-mapping.module';
import { ReferralModule } from './referral/referral.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'webhooks',
        ttl: 60000, // 1 minute window
        limit: 100, // 100 requests per minute per IP
      },
    ]),
    DatabaseModule,
    CryptoModule,
    AuthModule,
    SettingsModule,
    TelegramModule,
    GhlModule,
    WebhooksModule,
    ContactMappingModule,
    ReferralModule,
    BillingModule,
  ],
})
export class AppModule {}
