import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SsoGuard } from './guards/sso.guard';
import { Installation, InstallationSchema } from '../schemas/installation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Installation.name, schema: InstallationSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, SsoGuard],
  exports: [AuthService, SsoGuard],
})
export class AuthModule {}
