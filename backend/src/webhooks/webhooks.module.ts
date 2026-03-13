import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhooksController } from './webhooks.controller';
import { SettingsModule } from '../settings/settings.module';
import { TelegramModule } from '../telegram/telegram.module';
import { GhlModule } from '../ghl/ghl.module';
import { ContactMappingModule } from '../contact-mapping/contact-mapping.module';
import { Installation, InstallationSchema } from '../schemas/installation.schema';
import { MessageLog, MessageLogSchema } from '../schemas/message-log.schema';
import { ContactMapping, ContactMappingSchema } from '../schemas/contact-mapping.schema';

@Module({
  imports: [
    SettingsModule,
    TelegramModule,
    GhlModule,
    ContactMappingModule,
    MongooseModule.forFeature([
      { name: Installation.name, schema: InstallationSchema },
      { name: MessageLog.name, schema: MessageLogSchema },
      { name: ContactMapping.name, schema: ContactMappingSchema },
    ]),
  ],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
