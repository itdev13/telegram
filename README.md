# TeleSync — Two-Way Telegram Messaging for GoHighLevel

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

## Project Structure

```
telesync/
├── backend/
│   ├── src/
│   │   ├── main.ts                    # NestJS entry point
│   │   ├── app.module.ts              # Root module
│   │   ├── auth/                      # GHL OAuth + SSO decryption
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts     # /auth/callback, /auth/sso/decrypt
│   │   │   ├── auth.service.ts        # Token management, SSO
│   │   │   └── guards/sso.guard.ts    # SSO validation guard
│   │   ├── settings/                  # Telegram bot config CRUD
│   │   │   ├── settings.module.ts
│   │   │   ├── settings.controller.ts # /settings/:locationId/*
│   │   │   └── settings.service.ts    # Connect/disconnect/status
│   │   ├── telegram/                  # Telegram Bot API client
│   │   │   ├── telegram.module.ts
│   │   │   └── telegram.service.ts    # sendMessage, setWebhook, etc.
│   │   ├── ghl/                       # GHL Conversations API client
│   │   │   ├── ghl.module.ts
│   │   │   └── ghl.service.ts         # addInboundMessage, updateStatus
│   │   ├── webhooks/                  # Webhook handlers
│   │   │   ├── webhooks.module.ts
│   │   │   └── webhooks.controller.ts # /webhooks/telegram/:locationId, /webhooks/ghl-outbound
│   │   ├── contact-mapping/           # Telegram ↔ GHL contact mapping
│   │   │   ├── contact-mapping.module.ts
│   │   │   └── contact-mapping.service.ts
│   │   ├── database/                  # MongoDB connection
│   │   │   └── database.module.ts
│   │   ├── schemas/                   # Mongoose schemas
│   │   │   ├── installation.schema.ts
│   │   │   ├── contact-mapping.schema.ts
│   │   │   └── message-log.schema.ts
│   │   ├── crypto/                    # Encryption utilities
│   │   │   ├── crypto.module.ts
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
   - Delivery URL: `https://your-server.com/webhooks/ghl-outbound`
4. Generate a Shared Secret (SSO key) in Advanced Settings
5. Add a Custom Page pointing to your frontend URL

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in all environment variables (set DATABASE_URL to your MongoDB connection string)
npm install
npm run start:dev
# Mongoose auto-creates collections on first use
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MongoDB connection string |
| `GHL_CLIENT_ID` | GHL Marketplace App client ID |
| `GHL_CLIENT_SECRET` | GHL Marketplace App client secret |
| `GHL_REDIRECT_URI` | OAuth callback URL |
| `GHL_SSO_KEY` | Shared secret for Custom Page SSO decryption |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM encryption |
| `BACKEND_URL` | Public URL of the NestJS server |
| `FRONTEND_URL` | Public URL of the React frontend |

## Message Flow

### Inbound (Telegram → GHL)
1. Customer sends message to Telegram bot
2. Telegram webhook → `POST /webhooks/telegram/:locationId`
3. Backend creates/looks up GHL contact
4. Backend calls GHL Add Inbound Message API
5. Message appears in GHL Conversations

### Outbound (GHL → Telegram)
1. Agent replies in GHL Conversations UI
2. GHL webhook → `POST /webhooks/ghl-outbound`
3. Backend resolves Telegram chat ID from `replyToAltId`
4. Backend calls Telegram `sendMessage` API
5. Backend updates GHL message status to "delivered"
