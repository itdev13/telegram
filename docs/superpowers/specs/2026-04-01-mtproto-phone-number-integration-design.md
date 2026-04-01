# MTProto Phone Number Integration — Design Spec

## Overview

Add a second Telegram connection mode to TeleSync: **phone number login via MTProto** (GramJS), alongside the existing Bot API flow. Each GHL location chooses either bot OR phone number (one at a time). The GHL integration layer (contacts, messages, billing) is unchanged.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Connection modes | Bot OR phone per location (not both) | Simpler routing, no ambiguity, matches competitors (Umnico, Pepper Cloud) |
| Architecture | Dual-Service (Approach 1) | Zero risk to existing bot flow, matches codebase pattern |
| MTProto library | GramJS (`telegram` npm) | Pure JS, no native deps, StringSession for MongoDB persistence |
| Message scope | Private DMs only | Simplest, matches bot parity, groups can be added later |
| Auth UX | Inline multi-step form in GHL iframe | Phone → code → optional 2FA → connected. No popups or redirects |
| Health detection | Hybrid (autoReconnect + connection events) | No polling. Real-time disconnect detection. Re-auth only on session revocation |
| Scaling phase | Phase 1: in-process (0-50 accounts) | Ship fast, clean interface for Phase 2 migration |

## Scalability Constraints (from research)

| Constraint | Detail |
|---|---|
| GramJS stability | ~5-10 clients per process reliably; 20+ caused OOM in reported issues |
| Phase 1 ceiling | ~30-50 clients in a single Express process on 4-8GB RAM |
| `client.destroy()` required | `disconnect()` leaks `_updateLoop`. Always use `destroy()` |
| Mass reconnection | 50+ connects from same IP triggers FLOOD_WAIT (up to 24h). Must stagger at 2-3s intervals |
| Shared `api_id` | All users share one api_id. If Telegram flags it, all users break |
| Inbound auto-acknowledge | GramJS acks updates at transport layer. Crash mid-processing = message lost. Need write-ahead log |
| Session portability | StringSession can disconnect on one process, reconnect on another. Enables Phase 2 migration |

## Migration Strategy

Existing installations in MongoDB have no `connectionType` field. The runtime fallback handles this:
- If `connectionType` is `undefined` or `'bot'` → use existing bot flow
- If `connectionType` is `'phone'` → use MTProto flow
- No migration script needed. The `default: 'bot'` in the schema covers new records. Existing records without the field default to bot behavior via the `else` branch in all routing logic.

## Connection Mode Switching

A location can have either bot OR phone, never both. Switching modes:

- **Bot → Phone:** Tear down the bot webhook via `telegramService.deleteWebhook()`, set `telegramConfig: null`, then proceed with phone auth flow. Set `connectionType: 'phone'`.
- **Phone → Bot:** Destroy the GramJS client via `connectionManager.disconnect()`, set `phoneConfig: null`, then proceed with bot token flow. Set `connectionType: 'bot'`.
- **Disconnect (either):** Clear the active config, set `connectionType` back to `'bot'` (default).

The `connectionType` field is the single source of truth for which mode is active.

## Schema Changes

### Installation schema — new fields

```js
connectionType: { type: String, enum: ['bot', 'phone'], default: 'bot' },

phoneConfig: {
  phoneNumber: String,         // e.g., "+15551234567"
  sessionString: String,       // GramJS StringSession, encrypted with AES-256-GCM
  telegramUserId: String,      // String to handle BigInt-safe Telegram user IDs
  telegramUsername: String,    // e.g., "JohnFromAcme"
  displayName: String,         // "John Smith"
  isActive: Boolean,
  lastActivityAt: Date,        // updated on each inbound/outbound message, used for reconnect priority
  connectedAt: Date,
  updatedAt: Date,
}
```

Add compound index: `{ connectionType: 1, 'phoneConfig.isActive': 1 }` for efficient startup query.

### New schema: PhoneAuthSession (temporary, TTL 10 min)

```js
{
  locationId: String,          // unique, indexed
  phoneNumber: String,
  phoneCodeHash: String,       // from Telegram's auth.sendCode
  tempSessionString: String,   // encrypted partial session
  step: String,                // 'code_sent' | 'awaiting_2fa'
  expiresAt: Date,             // TTL index, auto-delete after 10 minutes
  createdAt: Date,
}
```

### New schema: PendingUpdate (write-ahead log, TTL 24h)

```js
{
  locationId: String,
  rawUpdate: String,           // JSON.stringify with BigInt→String replacer
  status: String,              // 'pending' | 'processing' | 'completed' | 'failed'
  attempts: { type: Number, default: 0 },  // max 3 retries
  maxAttempts: { type: Number, default: 3 },
  createdAt: Date,
  processedAt: Date,
  lastAttemptAt: Date,
  errorMessage: String,
  expiresAt: Date,             // TTL index, auto-delete after 24 hours
}
```

**BigInt serialization:** GramJS update objects contain BigInt values. Serialize with a custom replacer:
```js
JSON.stringify(update, (key, value) => typeof value === 'bigint' ? value.toString() : value)
```

**Recovery on startup:** After `initAllClients()`, run `recoverPendingUpdates()`:
1. Query `PendingUpdate` where `status` is `'pending'` or `'processing'` and `attempts < maxAttempts`
2. Set status to `'processing'`, increment `attempts`
3. Reprocess each update through `handleInboundUpdate`
4. If processing fails and `attempts >= maxAttempts`, set status to `'failed'`

### Unchanged schemas

ContactMapping, MessageLog, CompanyToken, CompanyLocation, ArchivedToken, BillingTransaction, Referral — no changes needed. The `telegramChatId` field works for both bots and user accounts.

## New Backend Services

### ConnectionManager (interface/class)

Abstracts all GramJS client lifecycle. No part of the app touches TelegramClient directly. This is the seam for Phase 2 migration (child processes) and Phase 3 (microservice).

```
ConnectionManager
├── clients: Map<locationId, { client, connected }>
├── connect(locationId, sessionString) → starts client, registers event handlers
├── disconnect(locationId) → client.destroy(), remove from map
├── disconnectAll() → graceful shutdown of all clients
├── getClient(locationId) → returns client or null
├── isConnected(locationId) → boolean
├── sendMessage(locationId, chatId, text) → telegramMessageId
├── sendPhoto(locationId, chatId, url, caption) → telegramMessageId
├── sendDocument(locationId, chatId, url, caption) → telegramMessageId
├── downloadMedia(locationId, message) → Buffer (for inbound attachments)
├── onNewMessage(locationId, callback) → registers inbound handler
└── initAllClients() → startup: load from DB, staggered reconnect
```

**Startup reconnection strategy:**
- Load active phone installations sorted by lastActivityAt (most recent first)
- Connect 5 at a time, 3-second delay between batches
- FLOOD_WAIT → exponential backoff, re-queue to end of list
- Total for 50 accounts: ~30 seconds

**Client configuration:**
```js
{
  connectionRetries: 5,
  requestRetries: 3,
  autoReconnect: true,
  retryDelay: 2000,
  floodSleepThreshold: 120,
}
```

**Connection event handling:**
- autoReconnect handles transient network blips
- AUTH_KEY_UNREGISTERED → mark phoneConfig.isActive = false, remove from pool
- Log all disconnect/reconnect events

**Graceful shutdown:**
- On SIGINT/SIGTERM → iterate all clients, destroy(), save sessions to MongoDB

### GramJsService (business logic)

Sits above ConnectionManager. Handles auth flow and message translation.

```
GramJsService
├── Dependencies: ConnectionManager, CryptoService
│
├── Auth flow (all session strings encrypted via CryptoService before MongoDB writes)
│   ├── sendCode(locationId, phoneNumber) → creates temp client, sends code,
│   │     encrypts temp session via CryptoService.encrypt(), stores in PhoneAuthSession
│   ├── verifyCode(locationId, code) → signs in, returns session or '2FA_REQUIRED'
│   │     on success: encrypts final session, saves to Installation.phoneConfig.sessionString
│   └── submit2FA(locationId, password) → completes auth,
│         encrypts final session, saves to Installation.phoneConfig.sessionString
│
├── Lifecycle
│   ├── initAllClients() → delegates to ConnectionManager, then recoverPendingUpdates()
│   ├── recoverPendingUpdates() → retries orphaned pending/processing updates (max 3 attempts)
│   └── destroyClient(locationId) → delegates to ConnectionManager
│
├── Inbound processing
│   └── handleInboundUpdate(locationId, update)
│       1. Write raw update to PendingUpdate collection (write-ahead, BigInt-safe serialization)
│       2. Extract message text, sender, chatId
│       3. Normalize GramJS user object to Bot API shape:
│          { first_name: user.firstName, last_name: user.lastName, username: user.username }
│       4. Get or create GHL contact via contactMappingService (same interface as bot flow)
│       5. Handle inbound media: if message has photo/document, call
│          connectionManager.downloadMedia() → get Buffer → upload to temp storage → get URL
│       6. Forward to GHL via ghlService.addInboundMessage (with attachment URLs if any)
│       7. Log to MessageLog
│       8. Update Installation.phoneConfig.lastActivityAt
│       9. Mark PendingUpdate as completed
│
└── Inbound media handling
    GramJS returns media as Buffers (not URLs like Bot API). To pass to GHL:
    1. connectionManager.downloadMedia(locationId, message.media) → Buffer
    2. Upload Buffer to a temporary storage (local /tmp or cloud bucket)
    3. Serve via a temporary signed URL endpoint: GET /media/:token
    4. Pass URL to ghlService.addInboundMessage as attachment
    Note: Phase 1 uses local /tmp + Express static route with token-based access.
    Phase 2+ can move to S3/GCS signed URLs.
```

## Router Changes

### Settings router — new phone endpoints

```
POST   /settings/:locationId/phone/send-code    → { phoneCodeHash }
POST   /settings/:locationId/phone/verify-code   → { connected, user } or { require2FA: true }
POST   /settings/:locationId/phone/verify-2fa    → { connected, user }
DELETE /settings/:locationId/phone/disconnect     → { connected: false }
GET    /settings/:locationId                      → now includes connectionType + phoneConfig
```

All protected by existing SSO middleware.

**Rate limiting on auth endpoints:** Max 3 `send-code` calls per 10 minutes per locationId to prevent FLOOD_WAIT on the shared `api_id`. Uses `express-rate-limit` keyed on `req.params.locationId`.

**Error responses** follow existing pattern `{ error: "message" }`:
- Invalid phone number → 400 `{ error: "Invalid phone number format" }`
- FLOOD_WAIT → 429 `{ error: "Too many attempts. Please wait X seconds." }`
- Invalid code → 400 `{ error: "Invalid verification code" }`
- Code expired → 400 `{ error: "Verification code expired. Please request a new one." }`
- 2FA wrong → 401 `{ error: "Incorrect password" }`

### Webhooks router — outbound changes

`POST /webhooks/ghl-outbound` — add connectionType check:

```js
const installation = await Installation.findOne({ locationId });

if (installation.connectionType === 'phone') {
  // Use ConnectionManager to send via GramJS
  telegramMessageId = await connectionManager.sendMessage(locationId, telegramChatId, message);
} else {
  // Existing bot flow
  telegramMessageId = await telegramService.sendMessage(botToken, telegramChatId, message);
}
```

### Webhooks router — no new inbound endpoint

Unlike bots (which use HTTP webhooks), phone connections receive messages via GramJS event handlers registered in ConnectionManager. No new webhook route needed for inbound.

### Webhooks router — uninstall cleanup for phone connections

`handleAppUninstall` must also handle phone connections:
- Check `installation.connectionType`
- If `'phone'`: call `connectionManager.disconnect(locationId)` to destroy GramJS client
- Null out `phoneConfig` (in addition to existing `telegramConfig` cleanup)
- Clean up any in-progress `PhoneAuthSession` records for the location
- `connectionManager` must be passed as a dependency to `createWebhooksRouter`

### Media proxy endpoint (new)

```
GET /media/:token → serves temporary media file
```

Token-based access to downloaded GramJS media. Tokens are random UUIDs, files auto-delete after 1 hour. Not SSO-protected (GHL needs to fetch these URLs server-side). Rate-limited to prevent abuse.

## Frontend Changes

### Settings page — connection type selector

When disconnected, show two tiles:
- "Connect Telegram Bot" (existing flow)
- "Connect Phone Number" (new flow)

### Phone auth multi-step form

Step 1: Phone number input → calls POST /phone/send-code
Step 2: Verification code input → calls POST /phone/verify-code
Step 3 (conditional): 2FA password input → calls POST /phone/verify-2fa
Step 4: Connected state (shows phone number, username, display name)

### Connected state for phone

Same layout as bot connected state but shows:
- Phone number (masked: +1 ***-***-4567)
- Telegram username
- Display name
- Connection status
- Disconnect button

## Main.js Bootstrap Changes

```js
// New services
const ConnectionManager = require('./telegram/connection-manager');
const GramJsService = require('./telegram/gramjs.service');

const connectionManager = new ConnectionManager(cryptoService);
const gramJsService = new GramJsService(
  connectionManager, cryptoService, ghlService, contactMappingService
);

// Initialize all phone connections (staggered)
await gramJsService.initAllClients();

// Pass to routers that need it
app.use('/settings', createSettingsRouter(settingsService, gramJsService, ssoMiddleware));
app.use('/webhooks', webhookLimiter,
  createWebhooksRouter(settingsService, telegramService, ghlService, contactMappingService, connectionManager)
);

// Graceful shutdown
process.on('SIGINT', async () => {
  await connectionManager.disconnectAll();
  process.exit(0);
});
```

## Environment Variables — New

```
TELEGRAM_API_ID=12345                # from my.telegram.org/apps
TELEGRAM_API_HASH=abcdef1234567890   # from my.telegram.org/apps
```

## File Structure — New Files

```
backend/src/
├── telegram/
│   ├── telegram.service.js          # existing (unchanged)
│   ├── connection-manager.js        # NEW: GramJS client pool lifecycle
│   └── gramjs.service.js            # NEW: auth flow, message handling, inbound processing
├── settings/
│   ├── settings.service.js          # existing (minor changes: connectionType awareness)
│   ├── settings.router.js           # existing (add phone auth endpoints)
│   └── phone-settings.service.js    # NEW: phone connect/disconnect/status logic
├── media/
│   └── media.router.js              # NEW: token-based media proxy endpoint
├── schemas/
│   ├── phone-auth-session.schema.js # NEW: temporary auth state
│   └── pending-update.schema.js     # NEW: write-ahead log
```

## Anti-Patterns to Avoid

1. **Never expose TelegramClient outside ConnectionManager** — all access via interface methods
2. **Always use `client.destroy()` not `disconnect()`** — disconnect leaks the update loop
3. **Never log session strings** — treat like passwords, encrypt at rest
4. **Never reconnect all clients simultaneously** — stagger to avoid FLOOD_WAIT
5. **Never process inbound updates without write-ahead** — crash = message loss
6. **Never store plaintext session strings in MongoDB** — use CryptoService.encrypt()

## Future Phases (not in this implementation)

- **Phase 2 (100-1000 accounts):** Replace InProcessConnectionManager with ChildProcessConnectionManager (fork worker processes, IPC routing)
- **Phase 3 (1000+ accounts):** Separate connector microservice with Redis-based routing and Bull queue
- **Connected Business Bot (Bot API 7.2+):** Third connection type, extends existing bot code
- **Group message sync:** Extend phone connection to forward selected group messages
