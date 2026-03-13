import { useState, useEffect, useCallback } from "react";

// ── Config ───────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const IS_DEV = import.meta.env.DEV; // true when running `npm run dev`

// ── SSO Hook (real GHL integration) ──────────────────
function useSso() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ssoPayload, setSsoPayload] = useState(null);

  const decryptPayload = useCallback(async (encryptedPayload) => {
    try {
      const res = await fetch(`${API_BASE}/auth/sso/decrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: encryptedPayload }),
      });
      if (!res.ok) throw new Error("SSO decryption failed");
      const data = await res.json();
      if (!data.success || !data.data.locationId) {
        throw new Error("Please open this page from a sub-account");
      }
      setUser(data.data);
      setSsoPayload(encryptedPayload);
    } catch (err) {
      setError(err.message || "SSO authentication failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // In dev mode, skip SSO and use mock data
    if (IS_DEV) {
      setTimeout(() => {
        setUser({
          userId: "dev_user_001",
          companyId: "dev_company_001",
          locationId: "dev_location_001",
          userName: "Vishal (Dev Mode)",
          email: "vishal@example.com",
          role: "admin",
        });
        setSsoPayload("dev-mock-payload");
        setLoading(false);
      }, 1200);
      return;
    }

    // Production: real GHL SSO handshake
    const handleMessage = (event) => {
      if (event.data?.message === "REQUEST_USER_DATA_RESPONSE") {
        decryptPayload(event.data.payload);
      }
    };
    window.addEventListener("message", handleMessage);
    window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");

    const timeout = setTimeout(() => {
      setLoading(false);
      setError("Could not connect to GoHighLevel. Please refresh the page.");
    }, 10000);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timeout);
    };
  }, [decryptPayload]);

  return { user, loading, error, ssoPayload };
}

// ── API Service ──────────────────────────────────────
const api = {
  async call(method, path, ssoPayload, body) {
    // In dev mode, simulate API responses
    if (IS_DEV) return this.mockCall(method, path, body);

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-SSO-Payload": ssoPayload,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Request failed" }));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async mockCall(method, path, body) {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 1500));

    if (path.includes("/connect")) {
      const token = body?.botToken || "";
      if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(token.trim())) {
        throw new Error("Invalid bot token. Check the token from BotFather.");
      }
      return {
        connected: true,
        bot: {
          username: "AcmeSupportBot",
          id: "7123456789",
          isActive: true,
          connectedAt: new Date().toISOString(),
        },
      };
    }

    if (path.includes("/disconnect")) {
      return { connected: false, bot: null };
    }

    if (path.includes("/status")) {
      return {
        status: "connected",
        webhook: {
          url: "https://your-server.com/webhooks/telegram/dev_location_001",
          pendingUpdateCount: 0,
          lastErrorDate: null,
          lastErrorMessage: null,
        },
      };
    }

    // GET config
    return { connected: false, bot: null };
  },
};

// ── Icons ────────────────────────────────────────────
function TelegramIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.28-.02-.12.03-2.02 1.28-5.69 3.77-.54.37-1.03.55-1.47.54-.48-.01-1.4-.27-2.09-.49-.84-.28-1.51-.42-1.45-.89.03-.25.38-.5 1.04-.78 4.07-1.77 6.79-2.94 8.15-3.51 3.88-1.62 4.69-1.9 5.21-1.91.12 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .38z"
        fill="#0088cc"
      />
    </svg>
  );
}

function CheckCircle() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        fill="#22C55E"
      />
    </svg>
  );
}

function AlertCircle() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 7a1 1 0 112 0v4a1 1 0 11-2 0V7zm1 8a1 1 0 100-2 1 1 0 000 2z"
        fill="#EF4444"
      />
    </svg>
  );
}

function Loader() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className="animate-spin"
    >
      <circle cx="10" cy="10" r="8" stroke="#E5E7EB" strokeWidth="2.5" />
      <path
        d="M10 2a8 8 0 018 8"
        stroke="#0088cc"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronDown({ open }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
      }}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="#6B7280"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExternalLink() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M5.5 2.5H3.5A1 1 0 002.5 3.5v7a1 1 0 001 1h7a1 1 0 001-1v-2M8.5 1.5h4m0 0v4m0-4l-6 6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Dev Mode Banner ──────────────────────────────────
function DevBanner({ user }) {
  if (!IS_DEV) return null;
  return (
    <div style={styles.devBanner}>
      <span style={styles.devBannerDot} />
      <span>
        <strong>Dev Mode</strong> — SSO is mocked. API calls are simulated.
        Location: <code style={styles.devCode}>{user?.locationId}</code>
      </span>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────
export default function App() {
  const { user, loading: ssoLoading, error: ssoError, ssoPayload } = useSso();

  const [appState, setAppState] = useState("loading"); // loading | disconnected | connecting | connected | error
  const [botToken, setBotToken] = useState("");
  const [botInfo, setBotInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Fetch existing config once SSO resolves
  useEffect(() => {
    if (ssoLoading) return;

    if (ssoError) {
      setAppState("error");
      setErrorMsg(ssoError);
      return;
    }

    if (!user) return;

    // Fetch current config from backend
    const fetchConfig = async () => {
      try {
        const config = await api.call(
          "GET",
          `/settings/${user.locationId}`,
          ssoPayload
        );
        if (config.connected && config.bot) {
          setBotInfo(config.bot);
          setAppState("connected");
        } else {
          setAppState("disconnected");
        }
      } catch (err) {
        // If fetch fails, just show disconnected state
        setAppState("disconnected");
      }
    };

    fetchConfig();
  }, [user, ssoLoading, ssoError, ssoPayload]);

  // ── Connect handler ────────────────────────────────
  const handleConnect = async () => {
    if (!botToken.trim()) {
      setErrorMsg("Please enter your bot token");
      return;
    }

    if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(botToken.trim())) {
      setErrorMsg(
        "This doesn't look like a valid bot token. It should be in the format 123456789:ABCdef..."
      );
      return;
    }

    setErrorMsg("");
    setAppState("connecting");

    try {
      const result = await api.call(
        "POST",
        `/settings/${user.locationId}/connect`,
        ssoPayload,
        { botToken: botToken.trim() }
      );

      setBotInfo(result.bot);
      setAppState("connected");
      setBotToken(""); // Clear token from memory
    } catch (err) {
      setErrorMsg(err.message || "Failed to connect bot. Please try again.");
      setAppState("disconnected");
    }
  };

  // ── Disconnect handler ─────────────────────────────
  const handleDisconnect = async () => {
    setShowDisconnectConfirm(false);

    try {
      await api.call(
        "DELETE",
        `/settings/${user.locationId}/disconnect`,
        ssoPayload
      );
    } catch (err) {
      // Still reset UI even if API fails
      console.error("Disconnect API failed:", err);
    }

    setAppState("disconnected");
    setBotInfo(null);
    setBotToken("");
    setTestResult(null);
  };

  // ── Test connection handler ────────────────────────
  const handleTestConnection = async () => {
    setTestResult("testing");
    try {
      const result = await api.call(
        "GET",
        `/settings/${user.locationId}/status`,
        ssoPayload
      );
      setTestResult(result.status === "connected" ? "success" : "failed");
    } catch {
      setTestResult("failed");
    }
    setTimeout(() => setTestResult(null), 4000);
  };

  // ════════════════════════════════════════════════════
  // RENDER: Loading State
  // ════════════════════════════════════════════════════
  if (appState === "loading") {
    return (
      <div style={styles.container}>
        <div style={styles.loadingWrapper}>
          <div style={styles.loadingSpinner}>
            <Loader />
          </div>
          <p style={styles.loadingText}>Connecting to GoHighLevel...</p>
          <p style={styles.loadingSubtext}>Verifying your session</p>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════
  // RENDER: Error State (SSO failure)
  // ════════════════════════════════════════════════════
  if (appState === "error") {
    return (
      <div style={styles.container}>
        <DevBanner user={user} />
        <div style={styles.errorCard}>
          <AlertCircle />
          <div>
            <h3 style={styles.errorCardTitle}>Connection Error</h3>
            <p style={styles.errorCardText}>{errorMsg}</p>
            <button
              style={styles.secondaryBtn}
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════
  // RENDER: Connected State
  // ════════════════════════════════════════════════════
  if (appState === "connected" && botInfo) {
    return (
      <div style={styles.container}>
        <DevBanner user={user} />

        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.logoWrapper}>
              <TelegramIcon size={32} />
            </div>
            <div>
              <h1 style={styles.title}>TeleSync</h1>
              <p style={styles.subtitle}>
                Telegram integration for GoHighLevel
              </p>
            </div>
          </div>
          <div style={styles.statusBadge}>
            <span style={styles.statusDot} />
            Connected
          </div>
        </div>

        <div style={styles.connectedCard}>
          <div style={styles.connectedHeader}>
            <CheckCircle />
            <span style={styles.connectedTitle}>Telegram Bot Connected</span>
          </div>

          <div style={styles.botInfoGrid}>
            <div style={styles.botInfoItem}>
              <span style={styles.botInfoLabel}>Bot Username</span>
              <span style={styles.botInfoValue}>@{botInfo.username}</span>
            </div>
            <div style={styles.botInfoItem}>
              <span style={styles.botInfoLabel}>Bot ID</span>
              <span style={styles.botInfoValue}>{botInfo.id}</span>
            </div>
            <div style={styles.botInfoItem}>
              <span style={styles.botInfoLabel}>Status</span>
              <span style={{ ...styles.botInfoValue, color: "#22C55E" }}>
                Active
              </span>
            </div>
            <div style={styles.botInfoItem}>
              <span style={styles.botInfoLabel}>Location</span>
              <span style={styles.botInfoValue}>{user?.locationId}</span>
            </div>
          </div>

          <div style={styles.connectedNote}>
            <TelegramIcon size={16} />
            <span>
              Messages sent to <strong>@{botInfo.username}</strong> on Telegram
              will appear in your GHL Conversations tab.
            </span>
          </div>

          <div style={styles.connectedActions}>
            <button
              style={{
                ...styles.secondaryBtn,
                ...(testResult === "testing" ? { opacity: 0.7 } : {}),
              }}
              onClick={handleTestConnection}
              disabled={testResult === "testing"}
            >
              {testResult === "testing" ? (
                <>
                  <Loader /> Testing...
                </>
              ) : testResult === "success" ? (
                <>
                  <CheckCircle /> Webhook Active
                </>
              ) : testResult === "failed" ? (
                <>
                  <AlertCircle /> Check Failed
                </>
              ) : (
                "Test Connection"
              )}
            </button>

            <button
              style={styles.ghostBtn}
              onClick={() =>
                window.open(`https://t.me/${botInfo.username}`, "_blank")
              }
            >
              Open in Telegram <ExternalLink />
            </button>

            <button
              style={styles.dangerBtn}
              onClick={() => setShowDisconnectConfirm(true)}
            >
              Disconnect Bot
            </button>
          </div>
        </div>

        {/* Disconnect Confirmation Modal */}
        {showDisconnectConfirm && (
          <div style={styles.modalOverlay}>
            <div style={styles.modal}>
              <h3 style={styles.modalTitle}>Disconnect Telegram Bot?</h3>
              <p style={styles.modalText}>
                This will stop syncing messages between Telegram and GoHighLevel
                for this location. Your existing conversation history in GHL
                will be preserved.
              </p>
              <div style={styles.modalActions}>
                <button
                  style={styles.secondaryBtn}
                  onClick={() => setShowDisconnectConfirm(false)}
                >
                  Cancel
                </button>
                <button style={styles.dangerBtn} onClick={handleDisconnect}>
                  Yes, Disconnect
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════
  // RENDER: Disconnected / Connecting State
  // ════════════════════════════════════════════════════
  return (
    <div style={styles.container}>
      <DevBanner user={user} />

      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoWrapper}>
            <TelegramIcon size={32} />
          </div>
          <div>
            <h1 style={styles.title}>TeleSync</h1>
            <p style={styles.subtitle}>
              Connect your Telegram bot to receive and send messages from
              GoHighLevel
            </p>
          </div>
        </div>
      </div>

      {/* Setup Card */}
      <div style={styles.setupCard}>
        <h2 style={styles.setupTitle}>Connect Your Telegram Bot</h2>
        <p style={styles.setupDescription}>
          To get started, you'll need a Telegram Bot Token from{" "}
          <strong>@BotFather</strong>. If you don't have one yet, follow the
          instructions below.
        </p>

        {/* Collapsible BotFather Instructions */}
        <button
          style={styles.instructionsToggle}
          onClick={() => setShowInstructions(!showInstructions)}
        >
          <span>
            {showInstructions ? "Hide" : "Show"} setup instructions
          </span>
          <ChevronDown open={showInstructions} />
        </button>

        {showInstructions && (
          <div style={styles.instructionsCard}>
            <div style={styles.stepList}>
              {[
                {
                  num: "1",
                  title: "Open Telegram",
                  desc: 'Search for "@BotFather" and start a chat',
                },
                {
                  num: "2",
                  title: "Create a new bot",
                  desc: "Send the command /newbot and follow the prompts",
                },
                {
                  num: "3",
                  title: "Choose a name",
                  desc: 'Give your bot a display name (e.g., "Acme Support")',
                },
                {
                  num: "4",
                  title: "Choose a username",
                  desc: 'Pick a unique username ending in "bot" (e.g., AcmeSupportBot)',
                },
                {
                  num: "5",
                  title: "Copy the token",
                  desc: "BotFather will send you a token like 123456789:ABCdef... — paste it below",
                },
              ].map((step) => (
                <div key={step.num} style={styles.step}>
                  <div style={styles.stepNum}>{step.num}</div>
                  <div>
                    <div style={styles.stepTitle}>{step.title}</div>
                    <div style={styles.stepDesc}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.instructionsTip}>
              <span style={{ fontSize: "14px" }}>💡</span>
              <span>
                Already have a bot? Just paste the token below. You can find it
                by messaging <strong>@BotFather</strong> and sending{" "}
                <code style={styles.code}>/mybots</code>.
              </span>
            </div>
          </div>
        )}

        {/* Token Input */}
        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Bot Token</label>
          <div style={{ position: "relative" }}>
            <input
              style={{
                ...styles.input,
                ...(errorMsg ? { borderColor: "#EF4444" } : {}),
              }}
              type={tokenVisible ? "text" : "password"}
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
              value={botToken}
              onChange={(e) => {
                setBotToken(e.target.value);
                setErrorMsg("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConnect();
              }}
              disabled={appState === "connecting"}
            />
            <button
              style={styles.visibilityToggle}
              onClick={() => setTokenVisible(!tokenVisible)}
              title={tokenVisible ? "Hide token" : "Show token"}
              type="button"
            >
              {tokenVisible ? "Hide" : "Show"}
            </button>
          </div>
          {errorMsg && (
            <div style={styles.errorMsg}>
              <AlertCircle />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Dev mode hint */}
          {IS_DEV && !botToken && (
            <p style={styles.devHint}>
              Dev mode: Paste any token matching the format{" "}
              <code style={styles.devCode}>123456789:ABCdefGHIjklMNOpqrsTUVwxyz12345678901</code>{" "}
              to test the flow.
            </p>
          )}
        </div>

        {/* Connect Button */}
        <button
          style={{
            ...styles.primaryBtn,
            ...(appState === "connecting" ? { opacity: 0.7 } : {}),
          }}
          onClick={handleConnect}
          disabled={appState === "connecting"}
        >
          {appState === "connecting" ? (
            <>
              <Loader /> Validating & connecting...
            </>
          ) : (
            <>
              <TelegramIcon size={18} /> Connect Bot
            </>
          )}
        </button>
      </div>

      {/* How it works */}
      <div style={styles.howItWorks}>
        <h3 style={styles.howItWorksTitle}>How it works</h3>
        <div style={styles.flowGrid}>
          {[
            {
              icon: "📱",
              title: "Customer messages your bot",
              desc: "They find your bot on Telegram and send a message",
            },
            {
              icon: "🔄",
              title: "TeleSync forwards to GHL",
              desc: "The message appears in your Conversations tab",
            },
            {
              icon: "💬",
              title: "Agent replies from GHL",
              desc: "Your team responds like any other conversation",
            },
            {
              icon: "✅",
              title: "Customer gets the reply",
              desc: "The response is sent back to Telegram instantly",
            },
          ].map((item, i) => (
            <div key={i} style={styles.flowItem}>
              <div style={styles.flowIcon}>{item.icon}</div>
              <div style={styles.flowItemTitle}>{item.title}</div>
              <div style={styles.flowItemDesc}>{item.desc}</div>
              {i < 3 && <div style={styles.flowArrow}>→</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════
const styles = {
  container: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "32px 24px",
    color: "#111827",
    minHeight: "100vh",
    background: "transparent",
  },

  // Dev banner
  devBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    background: "#FFF7ED",
    border: "1px solid #FDBA74",
    borderRadius: 8,
    fontSize: 12,
    color: "#9A3412",
    marginBottom: 20,
  },
  devBannerDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#F97316",
    flexShrink: 0,
  },
  devCode: {
    background: "#FED7AA",
    padding: "1px 5px",
    borderRadius: 3,
    fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
    fontSize: 11,
  },
  devHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#9A3412",
    lineHeight: 1.5,
  },

  // Loading
  loadingWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 400,
    gap: 16,
  },
  loadingSpinner: {
    width: 48,
    height: 48,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    fontWeight: 500,
    color: "#111827",
    margin: 0,
  },
  loadingSubtext: { fontSize: 14, color: "#6B7280", margin: 0 },

  // Error card
  errorCard: {
    display: "flex",
    gap: 12,
    padding: 24,
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: 12,
  },
  errorCardTitle: {
    margin: "0 0 4px",
    fontSize: 15,
    fontWeight: 600,
    color: "#991B1B",
  },
  errorCardText: {
    margin: "0 0 12px",
    fontSize: 14,
    color: "#B91C1C",
    lineHeight: 1.5,
  },

  // Header
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 32,
    gap: 16,
    flexWrap: "wrap",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 14 },
  logoWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "#E8F4FD",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#111827",
    letterSpacing: -0.3,
  },
  subtitle: {
    margin: "2px 0 0",
    fontSize: 14,
    color: "#6B7280",
    maxWidth: 400,
  },

  // Status badge
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 20,
    background: "#F0FDF4",
    color: "#166534",
    fontSize: 13,
    fontWeight: 500,
    border: "1px solid #BBF7D0",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#22C55E",
    display: "inline-block",
  },

  // Setup card
  setupCard: {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: "28px 28px 24px",
    marginBottom: 24,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  setupTitle: { margin: "0 0 8px", fontSize: 17, fontWeight: 600 },
  setupDescription: {
    margin: "0 0 20px",
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 1.6,
  },

  // Instructions
  instructionsToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 0",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    color: "#0088cc",
    fontWeight: 500,
    marginBottom: 4,
  },
  instructionsCard: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  stepList: { display: "flex", flexDirection: "column", gap: 14 },
  step: { display: "flex", gap: 12, alignItems: "flex-start" },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "#0088cc",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 1,
  },
  stepTitle: { fontWeight: 600, fontSize: 14, color: "#111827" },
  stepDesc: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  instructionsTip: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    marginTop: 16,
    padding: "10px 12px",
    background: "#FEF9C3",
    borderRadius: 8,
    fontSize: 13,
    color: "#854D0E",
    lineHeight: 1.5,
  },
  code: {
    background: "#F1F5F9",
    padding: "1px 5px",
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
    color: "#1E293B",
  },

  // Input
  inputGroup: { marginBottom: 20 },
  inputLabel: {
    display: "block",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 500,
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "10px 70px 10px 14px",
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    fontSize: 14,
    fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
    color: "#111827",
    background: "#fff",
    outline: "none",
    transition: "border-color 0.15s",
    boxSizing: "border-box",
  },
  visibilityToggle: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    color: "#6B7280",
    fontWeight: 500,
    padding: "4px 8px",
  },
  errorMsg: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    fontSize: 13,
    color: "#DC2626",
  },

  // Buttons
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "12px 20px",
    background: "#0088cc",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s",
  },
  secondaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 16px",
    background: "#F3F4F6",
    color: "#374151",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  ghostBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 16px",
    background: "transparent",
    color: "#0088cc",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  dangerBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 16px",
    background: "#FEF2F2",
    color: "#DC2626",
    border: "1px solid #FECACA",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },

  // Connected card
  connectedCard: {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  connectedHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  connectedTitle: { fontSize: 16, fontWeight: 600, color: "#166534" },
  botInfoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 20,
    padding: 16,
    background: "#F9FAFB",
    borderRadius: 10,
  },
  botInfoItem: { display: "flex", flexDirection: "column", gap: 3 },
  botInfoLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  botInfoValue: { fontSize: 14, color: "#111827", fontWeight: 500 },
  connectedNote: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "12px 14px",
    background: "#E8F4FD",
    borderRadius: 8,
    fontSize: 13,
    color: "#1E40AF",
    lineHeight: 1.5,
    marginBottom: 20,
  },
  connectedActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  // How it works
  howItWorks: {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  howItWorksTitle: {
    margin: "0 0 20px",
    fontSize: 15,
    fontWeight: 600,
    color: "#374151",
  },
  flowGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    position: "relative",
  },
  flowItem: {
    textAlign: "center",
    position: "relative",
    padding: "0 4px",
  },
  flowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "#F3F4F6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    margin: "0 auto 10px",
  },
  flowItemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#111827",
    marginBottom: 4,
  },
  flowItemDesc: { fontSize: 12, color: "#6B7280", lineHeight: 1.4 },
  flowArrow: {
    position: "absolute",
    right: -12,
    top: 18,
    fontSize: 16,
    color: "#D1D5DB",
    fontWeight: 700,
  },

  // Modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    backdropFilter: "blur(4px)",
  },
  modal: {
    background: "#fff",
    borderRadius: 16,
    padding: 28,
    maxWidth: 420,
    width: "90%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  modalTitle: { margin: "0 0 8px", fontSize: 17, fontWeight: 600 },
  modalText: {
    margin: "0 0 20px",
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 1.6,
  },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end" },
};
