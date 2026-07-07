// Compact, single-line representation of an error for logs.
// Axios errors carry huge request/socket objects — never log them whole.
function formatError(error) {
  if (!error) return String(error);

  // Axios / HTTP error
  if (error.response) {
    const status = error.response.status;
    let data = error.response.data;
    try {
      data = typeof data === 'string' ? data : JSON.stringify(data);
    } catch {
      data = '[unserializable]';
    }
    return `HTTP ${status} ${data}`;
  }

  // Network error with no response (timeout, DNS, etc.)
  if (error.code) {
    return `${error.code} ${error.message}`;
  }

  return error.message || String(error);
}

module.exports = { formatError };
