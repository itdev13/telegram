import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class DecryptSsoDto {
  @IsString()
  @IsNotEmpty()
  payload: string;
}

export class ConnectBotDto {
  @IsString()
  @IsNotEmpty()
  botToken: string;
}

export class OAuthCallbackDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @IsString()
  state?: string;
}
