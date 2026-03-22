import { Module } from '@nestjs/common';
import { GhlService } from './ghl.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [GhlService],
  exports: [GhlService],
})
export class GhlModule {}
