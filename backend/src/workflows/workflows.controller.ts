import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { TriggerSubscriptionDto, SendMessageActionDto, SendPhotoActionDto, SendDocumentActionDto } from '../common/dto';

// Override global ValidationPipe: GHL payloads may contain additional fields
// that would be rejected by the global forbidNonWhitelisted setting.
const ghlValidationPipe = new ValidationPipe({
  whitelist: false,
  transform: true,
  forbidNonWhitelisted: false,
});

@Controller('workflows')
export class WorkflowsController {
  private readonly logger = new Logger(WorkflowsController.name);

  constructor(private workflows: WorkflowsService) {}

  // ═══════════════════════════════════════════════════════════
  // TRIGGER SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════

  @Post('triggers/subscriptions')
  @HttpCode(HttpStatus.OK)
  @UsePipes(ghlValidationPipe)
  async handleTriggerSubscription(@Body() payload: TriggerSubscriptionDto) {
    this.logger.log(
      `Trigger subscription received: ${payload.triggerData?.eventType} for key=${payload.meta?.key}`,
    );

    try {
      const result = await this.workflows.handleSubscription(payload as any);
      return result;
    } catch (error: any) {
      this.logger.error(`Trigger subscription failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════

  @Post('actions/send-message')
  @HttpCode(HttpStatus.OK)
  @UsePipes(ghlValidationPipe)
  async handleSendMessage(@Body() payload: SendMessageActionDto) {
    this.logger.log(
      `Action send-message: location=${payload.extras?.locationId}, contact=${payload.extras?.contactId}`,
    );

    try {
      const result = await this.workflows.executeSendMessage(payload as any);
      return { success: true, data: result };
    } catch (error: any) {
      this.logger.error(`Action send-message failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @Post('actions/send-photo')
  @HttpCode(HttpStatus.OK)
  @UsePipes(ghlValidationPipe)
  async handleSendPhoto(@Body() payload: SendPhotoActionDto) {
    this.logger.log(
      `Action send-photo: location=${payload.extras?.locationId}, contact=${payload.extras?.contactId}`,
    );

    try {
      const result = await this.workflows.executeSendPhoto(payload as any);
      return { success: true, data: result };
    } catch (error: any) {
      this.logger.error(`Action send-photo failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @Post('actions/send-document')
  @HttpCode(HttpStatus.OK)
  @UsePipes(ghlValidationPipe)
  async handleSendDocument(@Body() payload: SendDocumentActionDto) {
    this.logger.log(
      `Action send-document: location=${payload.extras?.locationId}, contact=${payload.extras?.contactId}`,
    );

    try {
      const result = await this.workflows.executeSendDocument(payload as any);
      return { success: true, data: result };
    } catch (error: any) {
      this.logger.error(`Action send-document failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
