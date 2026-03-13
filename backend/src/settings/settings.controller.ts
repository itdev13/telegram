import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SsoGuard } from '../auth/guards/sso.guard';
import { ConnectBotDto } from '../common/dto';

@Controller('settings')
@UseGuards(SsoGuard)
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(private settingsService: SettingsService) {}

  /**
   * GET /settings/:locationId
   * Fetch current Telegram config for a location.
   */
  @Get(':locationId')
  async getConfig(@Param('locationId') locationId: string) {
    return this.settingsService.getConfig(locationId);
  }

  /**
   * POST /settings/:locationId/connect
   * Validate bot token, store config, register Telegram webhook.
   */
  @Post(':locationId/connect')
  async connectBot(
    @Param('locationId') locationId: string,
    @Body() dto: ConnectBotDto,
  ) {
    this.logger.log(`Connecting bot for location: ${locationId}`);
    return this.settingsService.connectBot(locationId, dto.botToken);
  }

  /**
   * DELETE /settings/:locationId/disconnect
   * Remove bot config and delete Telegram webhook.
   */
  @Delete(':locationId/disconnect')
  async disconnectBot(@Param('locationId') locationId: string) {
    this.logger.log(`Disconnecting bot for location: ${locationId}`);
    return this.settingsService.disconnectBot(locationId);
  }

  /**
   * GET /settings/:locationId/status
   * Health check: verify bot and webhook are active.
   */
  @Get(':locationId/status')
  async checkStatus(@Param('locationId') locationId: string) {
    return this.settingsService.checkStatus(locationId);
  }
}
