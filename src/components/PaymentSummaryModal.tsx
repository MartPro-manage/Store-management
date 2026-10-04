import React from 'react';
import { 
  X, 
  CreditCard, 
  Banknote, 
  Check, 
  ShieldCheck, 
  Calculator, 
  ArrowRight, 
  Receipt, 
  ShoppingBag, 
  Tag, 
  Sparkles,
  CheckCircle2,
  QrCode
} from 'lucide-react';
import { CartItem, DigitalPaymentMethodConfig } from '../types';

interface PaymentSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  cartSubtotal: number;
  cartTotal: number;
  paymentMethod: 'cash' | 'online';
  setPaymentMethod: (method: 'cash' | 'online') => void;
  configuredDigitalMethods: DigitalPaymentMethodConfig[];
  selectedDigitalProvider: string;
  setSelectedDigitalProvider: (provider: string) => void;
  onProceedToCashCheckout: (cashReceived?: number, changeReturned?: number) => void;
  onCompleteDigitalCheckout: () => void;
  checkoutLoading: boolean;
  storeName?: string;
  counterName?: string;
}

export const PaymentSummaryModal: React.FC<PaymentSummaryModalProps> = ({
  isOpen,
  onClose,
  cart,
  cartSubtotal,
  cartTotal,
  paymentMethod,
  setPaymentMethod,
  configuredDigitalMethods,
  selectedDigitalProvider,
  setSelectedDigitalProvider,
  onProceedToCashCheckout,
  onCompleteDigitalCheckout,
  checkoutLoading,
  storeName,
  counterName
}) => {
  const [cashInput, setCashInput] = React.useState<string>('');

  React.useEffect(() => {
    if (isOpen) {
      setCashInput(cartTotal.toString());
    }
  }, [isOpen, cartTotal]);

  if (!isOpen) return null;

  const totalDiscount = Math.max(0, cartSubtotal - cartTotal);
  const totalItemsCount = cart.reduce((acc, item) => {
    return acc + (item.product.sellBy === 'weight' ? 1 : item.quantity);
  }, 0);

  const numCashReceived = parseFloat(cashInput) || 0;
  const changeToCustomer = Math.max(0, numCashReceived - cartTotal);
  const isCashSufficient = numCashReceived >= cartTotal && numCashReceived > 0;

  const quickNotes = [
    { label: 'Exact', value: cartTotal },
    { label: 'Rs. 100', value: 100 },
    { label: 'Rs. 500', value: 500 },
    { label: 'Rs. 1,000', value: 1000 },
    { label: 'Rs. 2,000', value: 2000 },
    { label: 'Rs. 5,000', value: 5000 },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 flex items-center justify-center text-white font-black text-lg shadow-inner">
              💳
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <span>Payment & Bill Summary</span>
                <span className="text-[10px] bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full font-extrabold uppercase">
                  Shift + P
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                {storeName || 'Store POS'} {counterName ? `• ${counterName}` : ''} • {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={checkoutLoading}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Close summary (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="p-6 overflow-y-auto overscroll-contain space-y-6 custom-scrollbar">
          
          {/* Payable Amount Card */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 space-y-2 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Amount Payable</span>
                <span className="text-[11px] text-slate-400 font-medium">
                  Subtotal: <span className="font-mono text-slate-300">Rs. {cartSubtotal.toFixed(2)}</span>
                  {totalDiscount > 0 && (
                    <span className="ml-2 text-emerald-400 font-bold">
                      (Saved Rs. {totalDiscount.toFixed(2)})
                    </span>
                  )}
                </span>
              </div>
              <div className="text-3xl font-black text-amber-400 tracking-tight font-mono">
                Rs. {cartTotal.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Select Payment Method
              </label>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                {configuredDigitalMethods.length + 1} Options Available
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Cash Option */}
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative ${
                  paymentMethod === 'cash'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-400/40 font-bold'
                    : 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-400 text-emerald-950'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Banknote className={`w-6 h-6 ${paymentMethod === 'cash' ? 'text-white' : 'text-emerald-600'}`} />
                  {paymentMethod === 'cash' && <Check className="w-5 h-5 text-white" />}
                </div>
                <div className="font-black text-sm">Cash Payment</div>
                <div className={`text-[11px] mt-0.5 ${paymentMethod === 'cash' ? 'text-emerald-100' : 'text-slate-500'}`}>
                  Physical currency with change calculator
                </div>
              </button>

              {/* Digital Method Option */}
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('online');
                  if (!selectedDigitalProvider && configuredDigitalMethods.length > 0) {
                    setSelectedDigitalProvider(configuredDigitalMethods[0].name);
                  }
                }}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative ${
                  paymentMethod === 'online'
                    ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-400/40 font-bold'
                    : 'bg-blue-50/60 border-blue-200 hover:border-blue-400 text-blue-950'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <CreditCard className={`w-6 h-6 ${paymentMethod === 'online' ? 'text-white' : 'text-blue-600'}`} />
                  {paymentMethod === 'online' && <Check className="w-5 h-5 text-white" />}
                </div>
                <div className="font-black text-sm">Digital Method</div>
                <div className={`text-[11px] mt-0.5 ${paymentMethod === 'online' ? 'text-blue-100' : 'text-slate-500'}`}>
                  Card swipe, EasyPaisa, JazzCash, Raast
                </div>
              </button>
            </div>

            {/* Sub-selection for Cash Payment: Cash Received & Live Change */}
            {paymentMethod === 'cash' && (
              <div className="p-4 bg-emerald-50/90 border-2 border-emerald-300 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-emerald-700" />
                    <span>Cash Received From Customer (Rs.):</span>
                  </label>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-full">
                    Bill: Rs. {cartTotal.toFixed(2)}
                  </span>
                </div>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-emerald-700">
                    Rs.
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Enter cash received"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border-2 border-emerald-500 rounded-xl text-slate-900 font-mono font-black text-xl focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                {/* Quick Note Buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {quickNotes.map((note) => (
                    <button
                      key={note.label}
                      type="button"
                      onClick={() => setCashInput(note.value.toString())}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                        Math.abs(numCashReceived - note.value) < 0.01
                          ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                          : 'bg-white hover:bg-emerald-100 text-slate-800 border-emerald-200'
                      }`}
                    >
                      {note.label}
                    </button>
                  ))}
                </div>

                {/* Real-time Change Due Indicator */}
                <div className={`p-4 rounded-xl border-2 flex items-center justify-between gap-3 ${
                  isCashSufficient
                    ? 'bg-emerald-700 text-white border-emerald-800 shadow-md'
                    : 'bg-amber-100 text-amber-950 border-amber-300'
                }`}>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider">
                      {isCashSufficient ? 'Change to Give to Customer:' : 'Need More Cash:'}
                    </div>
                    <div className="text-2xl font-black font-mono">
                      {isCashSufficient 
                        ? `Rs. ${changeToCustomer.toFixed(2)}`
                        : `Need Rs. ${(cartTotal - numCashReceived).toFixed(2)} more`}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-full text-xs font-extrabold uppercase bg-white/20 backdrop-blur-sm">
                      {isCashSufficient ? '✓ Return to Customer' : 'Insufficient'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-selection for Digital Payment Provider */}
            {paymentMethod === 'online' && (
              <div className="p-4 bg-blue-50/90 border border-blue-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs font-black text-blue-950">
                  <span>Choose Digital Provider:</span>
                  <span className="text-[11px] bg-blue-200 text-blue-900 px-2.5 py-0.5 rounded-full font-extrabold">
                    {selectedDigitalProvider || 'Select provider'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {configuredDigitalMethods.map((method) => {
                    const isSelected = selectedDigitalProvider.toLowerCase().trim() === method.name.toLowerCase().trim();
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setSelectedDigitalProvider(method.name)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-700 text-white border-blue-800 shadow-sm font-bold ring-2 ring-blue-400/50'
                            : 'bg-white border-blue-200 hover:border-blue-400 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-extrabold text-xs truncate">{method.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <div className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                          {method.instructions || 'Digital payment'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Itemized Cart Breakdown with Clear Unit Price */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between text-xs font-black text-slate-700 uppercase tracking-wider">
              <span>Cart Items ({cart.length})</span>
              <span>Total: Rs. {cartTotal.toFixed(2)}</span>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 max-h-56 overflow-y-auto custom-scrollbar space-y-2">
              {cart.map((item) => {
                const isWeight = item.product.sellBy === 'weight' || item.product.unitType === 'kg';
                const unitRate = item.product.price || item.product.pricePerKg || 0;

                return (
                  <div key={item.product.id} className="flex items-center justify-between text-xs bg-white p-3 rounded-xl border border-slate-200/80 gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-slate-900 text-sm truncate">{item.product.name}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-mono font-bold text-[11px]">
                          Unit Price: Rs. {unitRate.toFixed(2)} {isWeight ? '/kg' : '/piece'}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          Qty: <strong className="text-slate-800">{isWeight ? `${item.quantity.toFixed(3)} kg` : item.quantity}</strong>
                        </span>
                      </div>
                    </div>
                    <div className="font-mono font-black text-orange-600 text-sm sm:text-base shrink-0">
                      Rs. {item.totalPrice.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Modal Footer Action */}
        <div className="bg-slate-50 p-5 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={onClose}
            disabled={checkoutLoading}
            className="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300 transition-colors cursor-pointer"
          >
            ← Back to Cart
          </button>

          {paymentMethod === 'cash' ? (
            <button
              type="button"
              onClick={() => onProceedToCashCheckout(numCashReceived, changeToCustomer)}
              disabled={checkoutLoading || cart.length === 0 || !isCashSufficient}
              className="w-full sm:w-auto flex-1 px-6 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Banknote className="w-5 h-5 text-white" />
              <span>
                Complete Payment {changeToCustomer > 0 ? `& Return Change (Rs. ${changeToCustomer.toFixed(0)})` : ''}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onCompleteDigitalCheckout}
              disabled={checkoutLoading || cart.length === 0}
              className="w-full sm:w-auto flex-1 px-6 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {checkoutLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing Payment...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Complete Payment & Issue Receipt</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
