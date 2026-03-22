import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

/**
 * Guard that validates the SSO session header on Custom Page API requests.
 * The frontend sends the encrypted SSO payload in the X-SSO-Payload header.
 * This guard decrypts it and attaches locationId to the request.
 */
@Injectable()
export class SsoGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ssoPayload = request.headers['x-sso-payload'];

    if (!ssoPayload) {
      throw new UnauthorizedException('Missing SSO payload header');
    }

    try {
      const userData = this.authService.decryptSsoPayload(ssoPayload);

      if (!userData.activeLocation) {
        throw new UnauthorizedException(
          'SSO session has no active location. Please open from a sub-account.',
        );
      }

      // Attach decoded identity to request for downstream use
      request.ssoUser = userData;
      request.locationId = userData.activeLocation;

      // Verify the locationId in the URL matches the SSO session
      const paramLocationId = request.params?.locationId;
      if (paramLocationId && paramLocationId !== userData.activeLocation) {
        throw new UnauthorizedException('Location ID mismatch with SSO session');
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired SSO session');
    }
  }
}
