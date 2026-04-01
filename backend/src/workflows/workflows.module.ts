import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowSubscription, WorkflowSubscriptionSchema } from '../schemas/workflow-subscription.schema';
import { ContactMappingModule } from '../contact-mapping/contact-mapping.module';
import { SettingsModule } from '../settings/settings.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkflowSubscription.name, schema: WorkflowSubscriptionSchema },
    ]),
    ContactMappingModule,
    SettingsModule,
    TelegramModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
