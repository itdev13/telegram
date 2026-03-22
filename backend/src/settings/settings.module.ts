import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { TelegramModule } from '../telegram/telegram.module';
import { AuthModule } from '../auth/auth.module';
import { Installation, InstallationSchema } from '../schemas/installation.schema';
import { CompanyLocation, CompanyLocationSchema } from '../schemas/company-location.schema';

@Module({
  imports: [
    TelegramModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: Installation.name, schema: InstallationSchema },
      { name: CompanyLocation.name, schema: CompanyLocationSchema },
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
