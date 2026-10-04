import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, CheckCircle2, AlertCircle, Loader2, X, Send, Sparkles, LogOut, ExternalLink } from 'lucide-react';
import { Sale, Store } from '../types';
import { 
  sendDirectEReceipt, 
  authenticateWithGmail, 
  getCachedGmailAddress, 
  disconnectGmail 
} from '../lib/gmail';

interface SendEReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale;
  store: Store;
  defaultEmail?: string;
}

export const SendEReceiptModal: React.FC<SendEReceiptModalProps> = ({
  isOpen,
  onClose,
  sale,
  store,
  defaultEmail = ''
}) => {
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [connectedGmail, setConnectedGmail] = useState<string | null>(getCachedGmailAddress());
  const [dispatchedSender, setDispatchedSender] = useState<string>('');

  if (!isOpen) return null;

  const handleConnectGmail = async () => {
    setConnectingGmail(true);
    setErrorMessage('');
    try {
      const res = await authenticateWithGmail();
      setConnectedGmail(res.email);
    } catch (err: any) {
      if (!err?.message?.includes('closed') && !err?.message?.includes('cancelled')) {
        setErrorMessage(err?.message || 'Failed to connect Gmail account.');
      }
    } finally {
      setConnectingGmail(false);
    }
  };

  const handleDisconnectGmail = () => {
    disconnectGmail();
    setConnectedGmail(null);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setStatus('error');
      setErrorMessage('Please enter a valid customer email address (e.g. customer@gmail.com).');
      return;
    }

    setSending(true);
    setStatus('idle');
    setErrorMessage('');

    try {
      const res = await sendDirectEReceipt({
        toEmail: cleanEmail,
        sale,
        store
      });

      setSending(false);

      if (res.success) {
        setStatus('success');
        setDispatchedSender(res.senderEmail || connectedGmail || 'Gmail');
        setConnectedGmail(getCachedGmailAddress());
        setTimeout(() => {
          onClose();
          setStatus('idle');
        }, 3200);
      } else {
        setStatus('error');
        setErrorMessage(res.error || 'Failed to dispatch email. Please check internet connection.');
      }
    } catch (err: any) {
      setSending(false);
      setStatus('error');
      setErrorMessage(err?.message || 'Unexpected dispatch error. Please try again.');
    }
  };

  const receiptNo = sale.receiptNumber || `#${sale.id.slice(-6).toUpperCase()}`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 text-white"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header Icon */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/20 text-orange-500 rounded-2xl flex items-center justify-center">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                Send E-Receipt via Gmail
                <Sparkles className="w-4 h-4 text-orange-400" />
              </h3>
              <p className="text-xs text-slate-400">
                Official Digital Invoice for {receiptNo}
              </p>
            </div>
          </div>

          {/* Direct Gmail Status Banner */}
          <div className="mb-4 p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
                </svg>
              </div>
              <div className="truncate">
                <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                  Gmail Dispatch Channel
                </span>
                <span className="font-mono text-emerald-400 font-bold text-xs truncate block">
                  {connectedGmail ? connectedGmail : 'Ready to Send Directly'}
                </span>
              </div>
            </div>

            {connectedGmail ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-[10px] border border-emerald-500/20">
                  Active
                </span>
                <button
                  type="button"
                  onClick={handleConnectGmail}
                  disabled={connectingGmail}
                  title="Switch to any other Google account"
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-lg border border-slate-700 transition-all cursor-pointer flex items-center gap-1"
                >
                  {connectingGmail ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Switch Account'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectGmail}
                disabled={connectingGmail}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-900 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer shrink-0"
              >
                {connectingGmail ? <Loader2 className="w-3 h-3 animate-spin text-slate-900" /> : 'Connect Google'}
              </button>
            )}
          </div>

          {status === 'success' ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-6 text-center space-y-3"
            >
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className="text-xl font-bold text-white">E-Receipt Sent!</h4>
              <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                Digital invoice for receipt <strong>{receiptNo}</strong> has been sent directly via Gmail from <strong className="text-emerald-400">{dispatchedSender}</strong> to <strong className="text-orange-400">{email}</strong> and saved in your store audit log.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md"
                >
                  Done / Close
                </button>
              </div>
            </motion.div>
          ) : (
            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Customer Email Address *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. customer@gmail.com"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 focus:border-orange-500 text-white rounded-xl text-sm outline-none transition-all pl-10"
                  />
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Customer receives itemized bill breakdown, store branding, and download pass directly in their inbox.
                </p>
              </div>

              {status === 'error' && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Store:</span>
                  <span className="font-semibold text-white">{store.name}</span>
                </div>
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Items Count:</span>
                  <span className="font-semibold text-white">{(sale.items || []).length} items</span>
                </div>
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Total Bill:</span>
                  <span className="font-bold text-orange-400">{store.currencySymbol || 'Rs.'} {(sale.totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !email.trim()}
                  className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-orange-600/20"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending via Gmail...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send via Gmail
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
