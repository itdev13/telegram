import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorkflowSubscriptionDocument = HydratedDocument<WorkflowSubscription>;

@Schema({ collection: 'workflow_subscriptions', timestamps: true })
export class WorkflowSubscription {
  @Prop({ required: true, index: true })
  locationId: string;

  @Prop({ required: true })
  companyId: string;

  @Prop({ required: true })
  workflowId: string;

  @Prop({ required: true })
  triggerKey: string;

  @Prop({ required: true })
  targetUrl: string;

  @Prop({ type: Object, default: {} })
  filters: Record<string, any>;

  @Prop({ type: Object, default: {} })
  extras: Record<string, any>;

  @Prop({ type: Object, default: {} })
  meta: Record<string, any>;

  @Prop({ default: 'active' })
  status: string;
}

export const WorkflowSubscriptionSchema = SchemaFactory.createForClass(WorkflowSubscription);

// Efficient lookup when firing triggers for a location
WorkflowSubscriptionSchema.index({ locationId: 1, triggerKey: 1, status: 1 });

// Prevent duplicate subscriptions per workflow+trigger
WorkflowSubscriptionSchema.index({ workflowId: 1, triggerKey: 1 }, { unique: true });
