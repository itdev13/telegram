import { useState, useRef } from 'react';

const CALENDAR_URL = 'https://calendar.app.google/gaZfdYSQZfSj6uMg9';

export default function SupportTab({ user, ssoPayload }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [fileList, setFileList] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [emailError, setEmailError] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const fileInputRef = useRef(null);

  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleEmailChange = (e) => {
    const email = e.target.value;
    setFormData({ ...formData, email });
    if (emailError) setEmailError('');
    if (email && !validateEmail(email)) {
      setEmailError('Please enter a valid email address');
    }
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    const total = fileList.length + selected.length;

    if (total > 5) {
      alert('Maximum 5 images allowed');
      return;
    }

    const valid = selected.filter((file) => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`${file.name} exceeds 5MB limit`);
        return false;
      }
      if (!file.type.startsWith('image/')) {
        alert(`${file.name} is not an image`);
        return false;
      }
      return true;
    });

    const newPreviews = valid.map((f) => URL.createObjectURL(f));
    setFileList([...fileList, ...valid]);
    setPreviews([...previews, ...newPreviews]);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const removeFile = (index) => {
    URL.revokeObjectURL(previews[index]);
    setFileList(fileList.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!formData.email || !formData.subject || !formData.message) {
      alert('Please fill in all required fields');
      return;
    }
    if (!validateEmail(formData.email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    try {
      setSubmitting(true);
      setResult(null);

      const body = new FormData();
      body.append('name', formData.name);
      body.append('email', formData.email);
      body.append('subject', formData.subject);
      body.append('message', formData.message);
      body.append('locationId', user?.locationId || '');
      body.append('userId', user?.userId || '');

      fileList.forEach((file) => {
        body.append('images', file);
      });

      const res = await fetch(`${API_BASE}/support/ticket`, {
        method: 'POST',
        headers: {
          'X-SSO-Payload': ssoPayload || '',
        },
        body,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Failed to submit ticket');
      }

      const data = await res.json();

      setResult({
        success: true,
        message: data.message || 'Support ticket submitted successfully!',
      });

      // Reset form
      setFormData({ name: '', email: '', subject: '', message: '' });
      previews.forEach((p) => URL.revokeObjectURL(p));
      setFileList([]);
      setPreviews([]);
    } catch (error) {
      setResult({
        success: false,
        message: error.message || 'Failed to submit support ticket. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = formData.email && formData.subject && formData.message && !emailError;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-sm">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Support</h2>
          <p className="text-xs text-gray-500">Need help? Send us a message and we'll get back to you</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Your Name <span className="text-gray-400">(Optional)</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-telegram focus:ring-1 focus:ring-telegram/20 focus:outline-none transition-colors"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={handleEmailChange}
              onBlur={() => {
                if (formData.email && !validateEmail(formData.email)) {
                  setEmailError('Please enter a valid email address');
                }
              }}
              placeholder="your@email.com"
              className={`w-full px-3.5 py-2.5 border rounded-lg text-sm focus:outline-none transition-colors ${
                emailError
                  ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-200'
                  : 'border-gray-300 focus:border-telegram focus:ring-1 focus:ring-telegram/20'
              }`}
            />
            {emailError && (
              <div className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {emailError}
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder="What do you need help with?"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-telegram focus:ring-1 focus:ring-telegram/20 focus:outline-none transition-colors"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Describe your issue or question in detail..."
              rows={5}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-telegram focus:ring-1 focus:ring-telegram/20 focus:outline-none transition-colors resize-y"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Attachments <span className="text-gray-400">(Optional — Max 5 images, 5MB each)</span>
            </label>
            <div className="flex flex-wrap gap-2.5 mb-2">
              {previews.map((preview, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg border border-gray-200 overflow-hidden group">
                  <img
                    src={preview}
                    alt={`Attachment ${i + 1}`}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setPreviewImage(preview)}
                  />
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {fileList.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-0.5 hover:border-telegram hover:bg-sky-50 transition-colors cursor-pointer"
                >
                  <span className="text-xl">📷</span>
                  <span className="text-[10px] text-gray-500">Upload</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <p className="text-[11px] text-gray-400">💡 Click on uploaded images to preview them</p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              isValid && !submitting
                ? 'bg-telegram text-white hover:bg-telegram-dark cursor-pointer shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {submitting ? 'Sending...' : 'Submit Support Ticket'}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-xl p-4 ${
          result.success
            ? 'bg-green-50 border border-green-200'
            : 'bg-red-50 border border-red-200'
        }`}>
          <div className={`font-semibold text-sm mb-1 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
            {result.success ? '✅ Ticket Submitted!' : '❌ Submission Failed'}
          </div>
          <div className={`text-xs ${result.success ? 'text-green-600' : 'text-red-600'}`}>
            {result.message}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-gradient-to-br from-sky-50 to-white border border-sky-100 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-telegram rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 text-sm mb-2">How We Can Help</h3>
            <ul className="space-y-1.5 text-xs text-gray-600">
              {[
                'Technical issues with TeleSync or your Telegram bot',
                'Questions about triggers, actions, or workflow setup',
                'Feature requests or suggestions',
                'Bug reports with screenshots',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-telegram shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-xs text-sky-700 bg-sky-100 rounded-lg p-2.5">
              <strong>📧 Response Time:</strong> We typically respond within 24 hours. You will receive a reply at the email you provided.
            </div>
            <div className="mt-2 text-xs text-sky-700 bg-sky-100 rounded-lg p-2.5">
              <strong>📅 Need more help?</strong> Book a free one-on-one session with our team:{' '}
              <a href={CALENDAR_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-telegram underline hover:text-telegram-dark">
                Schedule a Meeting
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-screen p-4">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-6 right-6 w-9 h-9 bg-white rounded-full flex items-center justify-center hover:bg-gray-100 shadow-lg z-10"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
