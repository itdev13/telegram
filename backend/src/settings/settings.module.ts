import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { TelegramModule } from '../telegram/telegram.module';
import { AuthModule } from '../auth/auth.module';
import { Installation, InstallationSchema } from '../schemas/installation.schema';

@Module({
  imports: [
    TelegramModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: Installation.name, schema: InstallationSchema },
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
