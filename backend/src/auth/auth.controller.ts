import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { DecryptSsoDto, OAuthCallbackDto } from '../common/dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  /**
   * GET /auth/callback
   * OAuth authorization code callback from GHL.
   * GHL redirects here after the user authorizes the app.
   */
  @Get('callback')
  async oauthCallback(
    @Query() query: OAuthCallbackDto,
    @Res() res: Response,
  ) {
    try {
      await this.authService.handleOAuthCallback(query.code);
      // Redirect to a success page or back to GHL
      res.redirect(`${this.config.get('FRONTEND_URL')}/setup-complete`);
    } catch (error) {
      this.logger.error('OAuth callback failed', error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'OAuth authorization failed. Please try installing again.',
      });
    }
  }

  /**
   * POST /auth/sso/decrypt
   * Decrypts the SSO payload sent from the Custom Page iframe.
   * Returns user identity and location context.
   */
  @Post('sso/decrypt')
  async decryptSso(@Body() dto: DecryptSsoDto) {
    const userData = this.authService.decryptSsoPayload(dto.payload);

    return {
      success: true,
      data: {
        userId: userData.userId,
        companyId: userData.companyId,
        locationId: userData.activeLocation,
        userName: userData.userName,
        email: userData.email,
        role: userData.role,
      },
    };
  }
}
