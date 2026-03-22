import { Controller, Get, Post, Param, Query, Body, Logger } from '@nestjs/common';
import { ReferralService } from './referral.service';

@Controller('referrals')
export class ReferralController {
  private readonly logger = new Logger(ReferralController.name);

  constructor(private referralService: ReferralService) {}

  @Get('stats')
  async getStats() {
    const stats = await this.referralService.getStats();
    return { success: true, data: stats };
  }

  @Get('installs/:referralCode')
  async getInstalls(@Param('referralCode') referralCode: string) {
    const installs = await this.referralService.getInstallsByCode(referralCode);
    return { success: true, data: installs };
  }

  @Post('influencer')
  async registerInfluencer(
    @Body()
    body: {
      referralCode: string;
      name: string;
      email: string;
      payoutMethod?: string;
      payoutDetails?: string;
    },
  ) {
    const { referralCode, ...influencer } = body;
    const result = await this.referralService.registerInfluencer(referralCode, influencer);
    return { success: true, data: result };
  }

  @Get('link')
  async generateLink(
    @Query('referralCode') referralCode: string,
    @Query('campaign') campaign?: string,
  ) {
    const link = await this.referralService.generateInstallLink(referralCode, campaign);
    return { success: true, data: { url: link } };
  }
}
