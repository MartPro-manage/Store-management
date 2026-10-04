import React from 'react';
import { 
  X, 
  Keyboard, 
  Sparkles, 
  HelpCircle, 
  Hash, 
  Receipt, 
  PauseCircle, 
  Scan,
  Maximize2,
  FileSpreadsheet,
  RotateCcw
} from 'lucide-react';
import { motion } from 'motion/react';

interface ShortKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortKeysModal: React.FC<ShortKeysModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const keyCombos = [
    {
      keys: ['R', '+', 'N'],
      title: 'Product Return & Refund',
      description: 'Press R and N simultaneously to open the batch product return modal.',
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: RotateCcw
    },
    {
      keys: ['H', '+', 'D'],
      title: 'Hold Billing',
      description: 'Temporarily parks the active cart so you can attend to another customer immediately.',
      badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
      icon: PauseCircle
    },
    {
      keys: ['A', '+', 'S'],
      title: 'View Held Receipts',
      description: 'Opens all held/parked bills to resume or discard them back into the active cart.',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
      icon: Receipt
    },
    {
      keys: ['S', '+', 'K'],
      title: 'Product Shortcuts Overview',
      description: 'Opens the complete 4-digit product shortcut directory for quick search and reference.',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: Hash
    },
    {
      keys: ['4-Digit Number', '+', 'Enter'],
      title: 'Quick Add by Shortcut',
      description: 'Type any product 4-digit code (e.g. 1001) anywhere on screen to instantly add that product.',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: Scan
    },
    {
      keys: ['F'],
      title: 'Toggle Full Screen Cart',
      description: 'Switches the cashier interface to an expansive full-screen scanning mode.',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: Maximize2
    },
    {
      keys: ['Esc'],
      title: 'Close Modal / Cancel',
      description: 'Quickly dismisses any open dialog, scanner modal, or exits full-screen display.',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: X
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-orange-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">Keyboard Shortcuts Guide</h2>
              <p className="text-xs text-slate-500">
                Master high-speed POS operations with keyboard combinations
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-3">
          {keyCombos.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-3.5 sm:p-4 rounded-xl border border-slate-200 hover:border-orange-300 bg-white hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg border shrink-0 ${item.badgeColor}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">{item.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  {item.keys.map((k, kIdx) => (
                    <span
                      key={kIdx}
                      className={
                        k === '+'
                          ? 'text-slate-400 font-bold text-xs px-0.5'
                          : 'px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 font-mono font-black text-xs shadow-2xs'
                      }
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Shortcuts are active on all POS cashier screens</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Got it
          </button>
        </div>
      </motion.div>
    </div>
  );
};
