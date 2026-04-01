// ── GHL SSO Payload (decrypted) ──────────────────────

export interface GhlSsoPayload {
  userId: string;
  companyId: string;
  activeLocation?: string; // Only present in sub-account context
  role: string;
  type: 'agency' | 'location';
  userName: string;
  email: string;
  isAgencyOwner: boolean;
  versionId: string;
  appStatus: string;
}

// ── GHL Provider Outbound Message Webhook ────────────

export interface GhlOutboundPayload {
  contactId: string;
  locationId: string;
  messageId: string;
  emailMessageId?: string;
  type: 'SMS' | 'Email' | 'Custom';
  phone?: string;
  message?: string;
  attachments?: string[];
  userId: string;
  replyToAltId?: string;
}

// ── GHL OAuth Token Response ─────────────────────────

export interface GhlTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  locationId?: string;
  companyId?: string;
  userId?: string;
  userType?: string;
}

// ── GHL Inbound Message Request ──────────────────────

export interface GhlInboundMessagePayload {
  type: 'Custom';
  conversationProviderId: string;
  contactId: string;
  message?: string;
  attachments?: string[];
  altId?: string;
}

// ── GHL Contact ──────────────────────────────────────

export interface GhlContact {
  id: string;
  locationId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

// ── Telegram Update (simplified) ─────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  caption?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

// ── Company Token ─────────────────────────────────────

export interface CompanyTokenData {
  companyId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  isActive: boolean;
}

// ── Billing ───────────────────────────────────────────

export interface BillingTransactionData {
  locationId: string;
  companyId?: string;
  type: 'message_sync' | 'subscription';
  ghlChargeId?: string;
  units?: number;
  pricing?: {
    amount: number;
    currency: string;
    meterId?: string;
  };
  status?: string;
  referralCode?: string;
}

// ── GHL Location Token Response ───────────────────────

export interface GhlLocationTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  locationId: string;
}

// ── GHL Workflow Trigger Subscription ─────────────────

export interface GhlTriggerSubscriptionPayload {
  triggerData: {
    id: string;
    key: string;
    filters: Record<string, any>[];
    eventType: 'CREATED' | 'UPDATED' | 'DELETED';
    targetUrl: string;
  };
  meta: {
    key: string;
    version: string;
  };
  extras: {
    locationId: string;
    workflowId: string;
    companyId: string;
  };
}

// ── GHL Workflow Action Payload ───────────────────────

export interface GhlActionPayload {
  data: Record<string, any>;
  extras: {
    locationId: string;
    contactId: string;
    workflowId: string;
  };
  meta: {
    key: string;
    version: string;
  };
  branches?: any[];
}

// ── Trigger Event Payload (what we POST to targetUrl) ─

export interface TriggerEventPayload {
  contactId: string;
  telegramChatId: number;
  telegramUsername: string;
  telegramFirstName: string;
  messageText: string;
  messageType: 'text' | 'photo' | 'document' | 'other';
  telegramMessageId: number;
  timestamp: string;
}

// ── Contact Mapping Result ────────────────────────────

export interface ContactMappingResult {
  ghlContactId: string;
  isNew: boolean;
}
