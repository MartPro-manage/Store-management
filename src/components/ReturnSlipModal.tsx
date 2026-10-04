import React, { useState } from 'react';
import { ProductReturn, Store } from '../types';
import { printReturnSlipDirect } from '../utils/printThermalReceipt';
import { 
  Printer, 
  Share2, 
  X, 
  Copy, 
  Download, 
  RotateCcw,
  CheckCircle2,
  Banknote,
  Calendar,
  Layers
} from 'lucide-react';

interface ReturnSlipModalProps {
  returnRecord: ProductReturn | null;
  store?: Store | null;
  storeName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ReturnSlipModal: React.FC<ReturnSlipModalProps> = ({
  returnRecord,
  store = null,
  storeName,
  isOpen,
  onClose
}) => {
  const [copied, setCopied] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);

  if (!isOpen || !returnRecord) return null;

  const itemsList = returnRecord.items && returnRecord.items.length > 0
    ? returnRecord.items
    : [{
        productId: returnRecord.productId,
        productName: returnRecord.productName,
        barcode: returnRecord.barcode,
        price: returnRecord.price,
        quantity: returnRecord.quantity,
        refundAmount: returnRecord.refundAmount,
        reason: returnRecord.reason
      }];

  const totalUnits = itemsList.reduce((sum, item) => sum + (item.quantity || 0), 0);

  const handlePrint = () => {
    setPrintStatus('Opening return slip printer...');
    try {
      printReturnSlipDirect(returnRecord, store);
      setPrintStatus('Print dialog opened!');
    } catch (err) {
      console.error('Print return slip error:', err);
      try {
        window.print();
        setPrintStatus('Print dialog opened!');
      } catch (e) {
        setPrintStatus('Press Ctrl+P to print');
      }
    }
    setTimeout(() => setPrintStatus(null), 3000);
  };

  const getFormattedSlipText = () => {
    const storeName = store?.name || returnRecord.storeName || 'SUPERMARKET';
    let text = `===================================\n`;
    text += `       ${storeName}       \n`;
    text += `  CUSTOMER RETURN & REFUND VOUCHER \n`;
    text += `===================================\n`;
    text += `Return Slip No: #${returnRecord.returnSlipNumber}\n`;
    text += `Date: ${new Date(returnRecord.timestamp).toLocaleString()}\n`;
    text += `Counter: ${returnRecord.counterName}\n`;
    text += `Cashier: ${returnRecord.cashierName || returnRecord.cashierUsername}\n`;
    text += `Refund Method: ${returnRecord.refundMethod.toUpperCase()}\n`;
    if (returnRecord.originalReceiptNumber) {
      text += `Original Invoice: #${returnRecord.originalReceiptNumber}\n`;
    }
    text += `-----------------------------------\n`;
    text += `RETURNED ITEM:\n`;
    text += `1. ${returnRecord.productName}\n`;
    text += `   ${returnRecord.quantity} x Rs. ${(returnRecord.price ?? (returnRecord as any).unitPrice ?? 0).toFixed(2)} = Rs. ${(returnRecord.refundAmount ?? 0).toFixed(2)}\n`;
    if (returnRecord.reason) {
      text += `Reason: ${returnRecord.reason}\n`;
    }
    text += `-----------------------------------\n`;
    text += `TOTAL REFUNDED: Rs. ${(returnRecord.refundAmount ?? 0).toFixed(2)}\n`;
    text += `RESTOCKED:      ${returnRecord.quantity} units replenished to inventory\n`;
    text += `===================================\n`;
    text += `  Refund processed successfully.   \n`;
    text += `===================================\n`;
    return text;
  };

  const handleCopyText = () => {
    const text = getFormattedSlipText();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownloadText = () => {
    const text = getFormattedSlipText();
    const element = document.createElement('a');
    const file = new Blob([text], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `ReturnSlip-${returnRecord.returnSlipNumber}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto overscroll-contain">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative space-y-5 max-h-[92vh] flex flex-col my-auto overflow-y-auto overscroll-contain custom-scrollbar">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 shrink-0 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200 shadow-sm">
              <RotateCcw className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Return & Refund Processed</h3>
              <p className="text-xs text-slate-500 font-medium">Slip #{returnRecord.returnSlipNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Restocked Banner */}
        <div className="bg-gradient-to-r from-rose-600 to-amber-600 text-white p-4 rounded-2xl shadow-md flex items-center justify-between gap-3 border border-rose-500 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm shrink-0">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold tracking-wide uppercase text-white">
                Item Returned to Stock
              </h4>
              <p className="text-[11px] text-rose-100 font-medium">
                +{returnRecord.quantity} units added back to inventory. Rs. {(returnRecord.refundAmount ?? 0).toFixed(2)} deducted from revenue.
              </p>
            </div>
          </div>
        </div>

        {/* Status */}
        {printStatus && (
          <div className="px-4 py-2 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0">
            <Printer className="w-4 h-4 text-rose-600 animate-pulse" />
            <span>{printStatus}</span>
          </div>
        )}

        {/* Printable Card */}
        <div 
          id="printable-return-slip"
          className="bg-white text-slate-900 p-4 sm:p-5 rounded-2xl shadow-lg font-mono text-xs space-y-3.5 border-2 border-slate-900"
        >
          {/* 1. Header Box */}
          <div className="border border-slate-300 rounded-xl p-3 bg-slate-50 text-center space-y-1">
            <div className="inline-block px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-300 text-rose-800 text-[9px] font-black uppercase tracking-wider">
              Customer Return Voucher
            </div>
            <div className="font-black text-base tracking-tight text-slate-900 uppercase pt-0.5">
              {store?.name || returnRecord.storeName || 'SUPERMARKET'}
            </div>
            <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">
              Official Stock Restock & Refund Note
            </div>
            {store?.address && (
              <div className="text-[9.5px] text-slate-500">{store.address}</div>
            )}
          </div>

          {/* 2. Metadata Box */}
          <div className="border border-slate-300 rounded-xl overflow-hidden bg-white">
            <table className="w-full border-collapse text-[10.5px]">
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="p-2 border-r border-slate-200 bg-slate-50/60 text-slate-600">
                    Slip #: <strong className="text-slate-900 font-mono">#{returnRecord.returnSlipNumber}</strong>
                  </td>
                  <td className="p-2 text-right text-slate-600">
                    {new Date(returnRecord.timestamp).toLocaleString()}
                  </td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-2 border-r border-slate-200 text-slate-600">
                    Counter: <strong className="text-slate-800">{returnRecord.counterName}</strong>
                  </td>
                  <td className="p-2 text-right text-slate-600">
                    Cashier: <strong className="text-slate-800">{returnRecord.cashierName || returnRecord.cashierUsername}</strong>
                  </td>
                </tr>
                <tr>
                  <td className="p-2 border-r border-slate-200 text-slate-600">
                    Refund Mode: <strong className="uppercase text-rose-700 font-bold">{returnRecord.refundMethod}</strong>
                  </td>
                  <td className="p-2 text-right text-slate-700 font-bold">
                    {returnRecord.originalReceiptNumber ? `Orig Inv: #${returnRecord.originalReceiptNumber}` : 'DIRECT RETURN'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 3. Items Table */}
          <div className="border border-slate-400 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-100 text-[10px] font-black uppercase text-slate-800">
                  <th className="p-2 border border-slate-300 w-[45%]">Returned Product</th>
                  <th className="p-2 border border-slate-300 text-center w-[15%]">Qty</th>
                  <th className="p-2 border border-slate-300 text-right w-[20%]">Price</th>
                  <th className="p-2 border border-slate-300 text-right w-[20%] text-rose-700">Refund</th>
                </tr>
              </thead>
              <tbody>
                {itemsList.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                    <td className="p-2 border border-slate-200 font-semibold text-slate-900 text-[11px]">
                      <span className="block truncate">{item.productName}</span>
                      {item.barcode && (
                        <span className="block text-[9px] text-slate-400 font-mono">Code: {item.barcode}</span>
                      )}
                    </td>
                    <td className="p-2 border border-slate-200 text-center font-bold text-rose-600 font-mono text-[11px]">+{item.quantity}</td>
                    <td className="p-2 border border-slate-200 text-right text-slate-700 font-mono text-[11px]">Rs. {(item.price || 0).toFixed(2)}</td>
                    <td className="p-2 border border-slate-200 text-right font-black text-rose-700 font-mono text-[11px]">Rs. {(item.refundAmount || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. Totals & Notes Card */}
          <div className="border-2 border-slate-800 rounded-xl overflow-hidden bg-white">
            <div className="flex justify-between p-2.5 text-sm sm:text-base font-black bg-slate-900 text-white">
              <span>TOTAL REFUNDED:</span>
              <span className="text-rose-400 font-mono">Rs. {(returnRecord.refundAmount ?? 0).toFixed(2)}</span>
            </div>
            {returnRecord.reason && (
              <div className="p-2 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-700">
                <strong>Return Reason:</strong> {returnRecord.reason}
              </div>
            )}
            <div className="p-2 bg-emerald-50 text-[10.5px] text-emerald-800 font-bold">
              ✔ Restock Verified: {totalUnits} unit(s) replenished to inventory.
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200 shrink-0">
          <button
            onClick={handlePrint}
            className="py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white font-extrabold rounded-xl shadow-sm transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Print Slip
          </button>

          <button
            onClick={handleCopyText}
            className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-200 rounded-xl transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <Copy className="w-4 h-4 text-slate-600" /> {copied ? 'Copied!' : 'Copy Text'}
          </button>

          <button
            onClick={handleDownloadText}
            className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-200 rounded-xl transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" /> Save TXT
          </button>
        </div>

      </div>
    </div>
  );
};
