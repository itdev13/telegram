import { Body, Controller, Get, HttpStatus, Logger, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthorizeQueryDto, DecryptSsoDto, OAuthCallbackDto } from '../common/dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  /**
   * GET /auth/authorize
   * Generates GHL OAuth install URL with optional referral tracking.
   */
  @Get('authorize')
  async authorize(@Query() query: AuthorizeQueryDto, @Res() res: Response) {
    const clientId = this.config.getOrThrow('GHL_CLIENT_ID');
    const redirectUri = this.config.getOrThrow('GHL_REDIRECT_URI');

    const scopes = [
      'conversations.readonly',
      'conversations.write',
      'conversations/message.readonly',
      'conversations/message.write',
      'contacts.readonly',
      'contacts.write',
      'charges.readonly',
      'charges.write',
      'locations.readonly',
      'oauth.readonly',
      'oauth.write',
      'marketplace-installer-details.readonly',
    ].join(' ');

    let state = '';
    if (query.ref || query.campaign) {
      const stateData: Record<string, string> = {};
      if (query.ref) stateData.ref = query.ref;
      if (query.campaign) stateData.campaign = query.campaign;
      state = Buffer.from(JSON.stringify(stateData)).toString('base64');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
    });

    if (state) {
      params.set('state', state);
    }

    const url = `https://marketplace.gohighlevel.com/oauth/chooselocation?${params.toString()}`;
    this.logger.log(`Redirecting to GHL OAuth: ref=${query.ref || 'none'}`);
    res.redirect(url);
  }

  /**
   * GET /auth/callback
   * OAuth authorization code callback from GHL.
   */
  @Get('callback')
  async oauthCallback(@Query() query: OAuthCallbackDto, @Res() res: Response) {
    try {
      await this.authService.handleOAuthCallback(query.code, query.state);
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
