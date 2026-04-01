export function TelegramIcon({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.28-.02-.12.03-2.02 1.28-5.69 3.77-.54.37-1.03.55-1.47.54-.48-.01-1.4-.27-2.09-.49-.84-.28-1.51-.42-1.45-.89.03-.25.38-.5 1.04-.78 4.07-1.77 6.79-2.94 8.15-3.51 3.88-1.62 4.69-1.9 5.21-1.91.12 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .38z"
        fill="#0088cc"
      />
    </svg>
  );
}

export function CheckCircle({ className = '' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        fill="#22C55E"
      />
    </svg>
  );
}

export function AlertCircle({ className = '' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 7a1 1 0 112 0v4a1 1 0 11-2 0V7zm1 8a1 1 0 100-2 1 1 0 000 2z"
        fill="#EF4444"
      />
    </svg>
  );
}

export function Loader({ className = '' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={`animate-spin ${className}`}>
      <circle cx="10" cy="10" r="8" stroke="#E5E7EB" strokeWidth="2.5" />
      <path d="M10 2a8 8 0 018 8" stroke="#0088cc" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDown({ open, className = '' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''} ${className}`}
    >
      <path d="M4 6l4 4 4-4" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneIcon({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ExternalLink({ className = '' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
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

export function PlusIcon({ className = '' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
