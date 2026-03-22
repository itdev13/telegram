import { Controller, Get, Query, Logger } from '@nestjs/common';
import { BillingService } from './billing.service';
import { AuthService } from '../auth/auth.service';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private billingService: BillingService,
    private authService: AuthService,
  ) {}

  @Get('status')
  async getStatus(@Query('companyId') companyId: string, @Query('locationId') locationId: string) {
    const accessToken = await this.authService.getAccessToken(locationId);
    const hasFunds = await this.billingService.hasFunds(companyId, accessToken);
    return { success: true, data: { hasFunds } };
  }

  @Get('transactions')
  async getTransactions(
    @Query('locationId') locationId: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const transactions = await this.billingService.getTransactions(
      locationId,
      limit ? parseInt(limit, 10) : 50,
      skip ? parseInt(skip, 10) : 0,
    );
    return { success: true, data: transactions };
  }

  @Get('config')
  async getConfig(@Query('locationId') locationId: string) {
    const accessToken = await this.authService.getAccessToken(locationId);
    const config = await this.billingService.fetchMeterPrices(accessToken, locationId);
    return { success: true, data: config };
  }
}
