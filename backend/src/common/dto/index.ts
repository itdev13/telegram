import { IsString, IsNotEmpty, IsOptional, IsObject, Allow } from 'class-validator';

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

export class AuthorizeQueryDto {
  @IsOptional()
  @IsString()
  ref?: string;

  @IsOptional()
  @IsString()
  campaign?: string;
}

// ── Workflow Trigger Subscription DTO ──────────────────
// GHL sends this when a workflow using our trigger is created/updated/deleted.
// We use @Allow() on nested objects since GHL may send additional fields
// and the global forbidNonWhitelisted would reject them.

export class TriggerSubscriptionDto {
  @Allow()
  triggerData: {
    id: string;
    key: string;
    filters: any[];
    eventType: string;
    targetUrl: string;
  };

  @Allow()
  meta: {
    key: string;
    version: string;
  };

  @Allow()
  extras: {
    locationId: string;
    workflowId: string;
    companyId: string;
  };
}

// ── Workflow Action DTOs ──────────────────────────────
// GHL sends these when an action executes in a workflow.
// Using @Allow() to accommodate GHL's payload structure.

export class SendMessageActionDto {
  @Allow()
  data: {
    message: string;
  };

  @Allow()
  extras: {
    locationId: string;
    contactId: string;
    workflowId: string;
  };

  @Allow()
  meta: {
    key: string;
    version: string;
  };

  @Allow()
  branches?: any[];
}

export class SendPhotoActionDto {
  @Allow()
  data: {
    photoUrl: string;
    caption?: string;
  };

  @Allow()
  extras: {
    locationId: string;
    contactId: string;
    workflowId: string;
  };

  @Allow()
  meta: {
    key: string;
    version: string;
  };

  @Allow()
  branches?: any[];
}

export class SendDocumentActionDto {
  @Allow()
  data: {
    documentUrl: string;
    caption?: string;
  };

  @Allow()
  extras: {
    locationId: string;
    contactId: string;
    workflowId: string;
  };

  @Allow()
  meta: {
    key: string;
    version: string;
  };

  @Allow()
  branches?: any[];
}
