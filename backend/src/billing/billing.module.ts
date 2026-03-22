import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { AuthModule } from '../auth/auth.module';
import {
  BillingTransaction,
  BillingTransactionSchema,
} from '../schemas/billing-transaction.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: BillingTransaction.name, schema: BillingTransactionSchema },
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
