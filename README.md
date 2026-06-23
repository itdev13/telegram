# Telegram Messaging Connector (TeleSync) — Two-Way Telegram Messaging for GoHighLevel

A GHL Marketplace App that bridges Telegram Bot messaging with GoHighLevel's Conversations interface using the Custom Conversation Provider module.

## Architecture

```
┌──────────────┐     webhook     ┌──────────────────┐     API      ┌──────────────┐
│   Telegram    │ ──────────────→│  NestJS Backend   │────────────→│     GHL      │
│   Bot API    │ ←──────────────│  (Middleware)      │←────────────│   Platform   │
└──────────────┘   sendMessage   └──────────────────┘   outbound   └──────────────┘
                                        │                            webhook
                                        │
                                  ┌─────┴──────┐
                                  │  MongoDB    │
                                  │ (Mongoose)  │
                                  └────────────┘
```

## Tech Stack

| Layer    | Technology                                    |
|----------|-----------------------------------------------|
| Backend  | NestJS 10, TypeScript 5, Mongoose 9           |
| Frontend | React 18, Vite 5                              |
| Database | MongoDB                                       |
| Security | AES-256-GCM, CryptoJS (SSO), @nestjs/throttler |

## Project Structure

```
telesync/
├── backend/
│   ├── src/
│   │   ├── main.ts                    # NestJS entry point
│   │   ├── app.module.ts              # Root module
│   │   ├── auth/                      # GHL OAuth + SSO decryption
│   │   │   ├── auth.controller.ts     # /auth/authorize, /auth/callback, /auth/sso/decrypt
│   │   │   ├── auth.service.ts        # Token management, SSO, company-level tokens
│   │   │   └── guards/sso.guard.ts    # SSO validation guard
│   │   ├── settings/                  # Telegram bot config CRUD
│   │   │   ├── settings.controller.ts # /settings/:locationId/*
│   │   │   └── settings.service.ts    # Connect/disconnect/status
│   │   ├── telegram/                  # Telegram Bot API client
│   │   │   └── telegram.service.ts    # sendMessage, setWebhook, rate-limit retry
│   │   ├── ghl/                       # GHL Conversations API client
│   │   │   └── ghl.service.ts         # addInboundMessage, updateStatus, token refresh
│   │   ├── webhooks/                  # Webhook handlers
│   │   │   └── webhooks.controller.ts # Telegram inbound, GHL outbound, app install/uninstall
│   │   ├── contact-mapping/           # Telegram ↔ GHL contact mapping
│   │   │   └── contact-mapping.service.ts
│   │   ├── billing/                   # Marketplace billing integration
│   │   │   └── billing.service.ts     # Wallet checks, per-message charging, meter pricing
│   │   ├── referral/                  # Affiliate/referral tracking
│   │   │   └── referral.service.ts    # Referral codes, install stats, influencer registration
│   │   ├── database/                  # MongoDB connection
│   │   │   └── database.module.ts
│   │   ├── schemas/                   # Mongoose schemas
│   │   │   ├── installation.schema.ts
│   │   │   ├── contact-mapping.schema.ts
│   │   │   ├── message-log.schema.ts
│   │   │   ├── company-token.schema.ts
│   │   │   ├── company-location.schema.ts
│   │   │   ├── archived-token.schema.ts
│   │   │   ├── billing-transaction.schema.ts
│   │   │   └── referral.schema.ts
│   │   ├── crypto/                    # Encryption utilities
│   │   │   └── crypto.service.ts      # AES-256-GCM + CryptoJS SSO
│   │   └── common/
│   │       ├── dto/index.ts           # Request validation DTOs
│   │       └── interfaces/index.ts    # TypeScript interfaces
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── main.jsx                   # React entry point
    │   └── App.jsx                    # SSO hook, API client, and UI (single-file app)
    ├── index.html
    ├── package.json
    └── vite.config.js
```

## Setup

### 1. GHL Marketplace App

1. Go to https://marketplace.gohighlevel.com
2. Create a new app with these scopes:
   - `conversations/message.write`
   - `conversations.write`
   - `contacts.write`
   - `contacts.readonly`
   - `conversations.readonly`
   - `conversations/message.readonly`
3. Add a Conversation Provider:
   - Type: SMS
   - Check "Is this a Custom Conversation Provider"
   - Check "Always show this Conversation Provider"
   - Alias: "Telegram"
   - Delivery URL: `https://<your-backend>/webhooks/ghl-outbound`
4. Generate a Shared Secret (SSO key) in Advanced Settings
5. Add a Custom Page pointing to your frontend URL

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in all environment variables (see table below)
npm install
npm run start:dev
# Mongoose auto-creates collections on first use
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env
# Set VITE_API_BASE to your backend URL
npm install
npm run dev
```

### 4. Deployment

- **Frontend:** Deployed to Netlify as a static site (`npm run build` → `dist/`)
- **Backend:** Any Node.js host (Render, Railway, Fly.io, or ngrok for dev)

```bash
# Deploy frontend to Netlify
cd frontend && npm run build && netlify deploy --dir dist --prod

# GHL Marketplace webhook URL (single endpoint for install/uninstall)
https://<your-backend>/webhooks/ghl-app-lifecycle
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MongoDB connection string |
| `GHL_CLIENT_ID` | GHL Marketplace App client ID |
| `GHL_CLIENT_SECRET` | GHL Marketplace App client secret |
| `GHL_REDIRECT_URI` | OAuth callback URL |
| `GHL_SSO_KEY` | Shared secret for Custom Page SSO decryption |
| `GHL_APP_ID` | Marketplace app ID |
| `GHL_API_BASE` | GHL API base URL (default: `https://services.leadconnectorhq.com`) |
| `GHL_API_VERSION` | GHL API version (default: `2021-04-15`) |
| `GHL_CONVERSATION_PROVIDER_ID` | Conversation Provider ID from GHL marketplace app |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM encryption |
| `BACKEND_URL` | Public URL of the NestJS server |
| `FRONTEND_URL` | Public URL of the React frontend |
| `PORT` | Server port (default: `3000`) |
| `NODE_ENV` | `development` or `production` |
| `INTERNAL_TESTING_COMPANY_IDS` | Comma-separated company IDs exempt from billing |

## API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/authorize` | OAuth install flow (accepts `ref`, `campaign` query params) |
| `GET` | `/auth/callback` | OAuth callback |
| `POST` | `/auth/sso/decrypt` | Decrypt SSO payload from GHL iframe |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings/:locationId` | Fetch bot config |
| `POST` | `/settings/:locationId/connect` | Connect Telegram bot |
| `DELETE` | `/settings/:locationId/disconnect` | Disconnect bot |
| `GET` | `/settings/:locationId/status` | Check webhook health |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhooks/telegram/:locationId` | Inbound Telegram messages |
| `POST` | `/webhooks/ghl-outbound` | Outbound GHL messages |
| `POST` | `/webhooks/ghl-app-lifecycle` | App install/uninstall (routes by `type` field in payload) |

## Message Flow

### Inbound (Telegram → GHL)
1. Customer sends message to Telegram bot
2. Telegram webhook → `POST /webhooks/telegram/:locationId`
3. Backend verifies webhook secret, extracts message/photo/document
4. Backend creates or looks up GHL contact from Telegram user data
5. Backend calls GHL Add Inbound Message API
6. Message appears in GHL Conversations

### Outbound (GHL → Telegram)
1. Agent replies in GHL Conversations UI
2. GHL webhook → `POST /webhooks/ghl-outbound`
3. Backend resolves Telegram chat ID from contact mapping
4. Backend calls Telegram `sendMessage` API
5. Backend updates GHL message status to "delivered"

## Database Collections

| Collection | Purpose |
|------------|---------|
| `installations` | GHL OAuth tokens, Telegram bot config, status per location |
| `contact_mapping` | Telegram chat ID ↔ GHL contact ID mappings |
| `message_logs` | Audit trail of all synced messages (direction, status, errors) |
| `company_tokens` | Company-level OAuth tokens for multi-location installs |
| `company_locations` | Company → location ID mappings |
| `archived_tokens` | Soft-deleted tokens retained for 90 days (compliance) |
| `billing_transactions` | Charge records, message counts, referral associations |
| `referrals` | Affiliate tracking — installs, charges, influencer data |

## Security

- **Encryption at rest:** Bot tokens and OAuth tokens stored with AES-256-GCM
- **SSO validation:** GHL Custom Page payloads decrypted and verified via guard
- **Webhook verification:** Per-location random secrets validate Telegram webhook authenticity
- **Rate limiting:** 100 req/min per IP on webhook endpoints via `@nestjs/throttler`
- **Token refresh:** Proactive refresh at 5-min expiry with race-condition handling
- **Soft delete:** App uninstall archives tokens and clears sensitive data
