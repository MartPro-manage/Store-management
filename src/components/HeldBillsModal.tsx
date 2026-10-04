import React from 'react';
import { HeldBill } from '../types';
import { 
  X, 
  RotateCcw, 
  Trash2, 
  Clock, 
  ShoppingBag, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  Receipt,
  ArrowRight
} from 'lucide-react';
import { motion } from 'motion/react';

interface HeldBillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  heldBills: HeldBill[];
  onRestoreBill: (bill: HeldBill) => void;
  onDeleteBill: (billId: string) => void;
}

export const HeldBillsModal: React.FC<HeldBillsModalProps> = ({
  isOpen,
  onClose,
  heldBills,
  onRestoreBill,
  onDeleteBill
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-xs overflow-y-auto overscroll-contain">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-y-auto overscroll-contain custom-scrollbar border border-slate-200 my-auto"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-purple-50/40 sticky top-0 bg-white z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-600/20">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900">Held Receipts & Parking</h2>
                <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[11px] font-mono font-bold">
                  A + S
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Resume temporarily held bills or discard parking orders
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

        {/* List of Held Bills */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
          {heldBills.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Receipt className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-bold text-slate-700 text-base">No Held Receipts In Queue</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Press <strong>H + D</strong> at the cashier screen to hold the active bill and serve the next customer.
              </p>
            </div>
          ) : (
            heldBills.map((bill, index) => {
              const formattedTime = new Date(bill.heldAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              });
              const formattedDate = new Date(bill.heldAt).toLocaleDateString();

              return (
                <div
                  key={bill.id}
                  className="p-4 rounded-xl border border-slate-200 hover:border-purple-300 bg-white hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs">
                        Held Bill #{index + 1}
                      </span>
                      {(bill.isAutoHeld || bill.notes?.toLowerCase().includes('auto-held') || bill.notes?.toLowerCase().includes('shutdown') || bill.notes?.toLowerCase().includes('logout')) && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px] flex items-center gap-1 shadow-2xs">
                          <AlertCircle className="w-3 h-3 text-amber-700" />
                          Auto-Saved on Shutdown / Logout
                        </span>
                      )}
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formattedTime} • {formattedDate}
                      </span>
                      {bill.customerName && (
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {bill.customerName}
                        </span>
                      )}
                    </div>

                    {/* Summary of items */}
                    <div className="mt-2 text-xs text-slate-600 line-clamp-2">
                      {bill.items.map(item => `${item.product.name} (x${item.quantity})`).join(', ')}
                    </div>

                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <span className="font-bold text-slate-500">
                        {bill.items.length} {bill.items.length === 1 ? 'item' : 'items'}
                      </span>
                      <span className="font-black text-purple-700 text-sm">
                        Total: Rs. {Number(bill.total || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onRestoreBill(bill);
                        onClose();
                      }}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs cursor-pointer shadow-xs transition-colors"
                      title="Restore items back to active cart"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Resume Bill</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteBill(bill.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
                      title="Discard this held receipt"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Total Held: <strong>{heldBills.length}</strong></span>
          <span className="text-slate-400">Press <strong>Esc</strong> to close</span>
        </div>
      </motion.div>
    </div>
  );
};
