import React, { useState, useEffect, useRef } from 'react';
import { Sale, Store } from '../types';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { isSlipExpired, getReceiptRemainingDays } from '../lib/salesCleanup';
import { SendEReceiptModal } from './SendEReceiptModal';
import { 
  Printer, 
  Share2, 
  X, 
  Check, 
  Copy, 
  Download, 
  ShoppingBag, 
  Receipt as ReceiptIcon,
  CheckCircle2, 
  Volume2, 
  Sparkles, 
  QrCode as QrCodeIcon, 
  Smartphone, 
  FileText, 
  ExternalLink,
  ShieldCheck,
  Image as ImageIcon,
  Link,
  Clock,
  Coins,
  Mail
} from 'lucide-react';
import { speakMessage, formatAmountWords, isSaleAnnounced, markSaleAsAnnounced } from '../lib/speech';
import { printThermalReceiptDirect } from '../utils/printThermalReceipt';

interface ReceiptModalProps {
  sale: Sale | null;
  store: Store | null;
  isOpen: boolean;
  onClose: () => void;
  voiceEnabled?: boolean;
  initialTab?: 'print' | 'ereceipt';
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  store,
  isOpen,
  onClose,
  voiceEnabled = true,
  initialTab = 'print'
}) => {
  const [activeReceiptMode, setActiveReceiptMode] = useState<'print' | 'ereceipt'>('print');
  const [copied, setCopied] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isSendMailModalOpen, setIsSendMailModalOpen] = useState(false);
  const receiptCardRef = useRef<HTMLDivElement | null>(null);

  const curr = store?.currencySymbol || 'Rs.';
  const receiptSubHeader = store?.receiptHeader || 'OFFICIAL SALES INVOICE';
  const receiptGreetingMessage = store?.receiptGreeting || 'Welcome & Thank You for Shopping With Us!';
  const receiptFooterText = store?.receiptFooter || `THANK YOU FOR SHOPPING AT ${(store?.name || sale?.storeName || 'OUR STORE').toUpperCase()}! Please retain slip for return.`;
  const isQrEnabled = Boolean(store?.receiptQrCodeEnabled);
  const qrTitle = store?.receiptQrTitle || 'Scan to Verify Receipt';
  const isVoiceAllowed = store?.voiceAnnouncementEnabled !== false;

  useEffect(() => {
    if (initialTab) {
      setActiveReceiptMode(initialTab);
    }
  }, [initialTab, isOpen]);

  const announcedSaleIdRef = useRef<string | null>(null);

  // Trigger audio voice greeting when receipt opens strictly ONE time per transaction
  useEffect(() => {
    if (isOpen && sale && voiceEnabled && isVoiceAllowed) {
      // If already announced (e.g. in Change Modal or previously), do not duplicate
      if (!isSaleAnnounced(sale.id) && announcedSaleIdRef.current !== sale.id) {
        announcedSaleIdRef.current = sale.id;
        markSaleAsAnnounced(sale.id);
        const storeName = store?.name || sale?.storeName || 'our store';
        const speech = `Thank you for shopping at ${storeName}! Total bill is ${formatAmountWords(sale.totalAmount)}.`;
        speakMessage(speech);
      }
    }
  }, [isOpen, sale?.id, voiceEnabled, isVoiceAllowed, store?.name]);

  const handleReplayVoice = () => {
    if (!sale || !isVoiceAllowed) return;
    const storeName = store?.name || sale?.storeName || 'our store';
    const speech = `Thank you for shopping at ${storeName}! Total bill is ${formatAmountWords(sale.totalAmount)}.`;
    speakMessage(speech);
  };

  const getItemDiscountsTotal = () => {
    if (!sale) return 0;
    return (sale.items || []).reduce((sum, it) => {
      if (it.originalPrice && it.originalPrice > it.price) {
        return sum + ((it.originalPrice - it.price) * (it.quantity || 1));
      }
      if (it.discountAmount && it.discountAmount > 0) {
        return sum + it.discountAmount;
      }
      return sum;
    }, 0);
  };

  const getDiscountMetrics = () => {
    if (!sale) return { billDiscount: 0, itemDiscounts: 0, totalDiscount: 0, subtotal: 0 };
    const itemDiscounts = getItemDiscountsTotal();
    const billDiscount = Number(sale.discountAmount || 0);
    const totalDiscount = Math.max(billDiscount, itemDiscounts);
    const subtotal = sale.subtotalAmount || ((sale.totalAmount || 0) + totalDiscount);
    return { billDiscount, itemDiscounts, totalDiscount, subtotal };
  };

  const getFormattedReceiptText = () => {
    if (!sale) return '';
    const storeName = store?.name || sale?.storeName || 'SUPERMARKET';
    const { totalDiscount, subtotal } = getDiscountMetrics();

    let text = `===================================\n`;
    text += `       ${storeName}       \n`;
    text += `   OFFICIAL SALES RECEIPT / INVOICE \n`;
    text += `===================================\n`;
    text += `Receipt No: #${sale.receiptNumber}\n`;
    text += `Date: ${new Date(sale.timestamp).toLocaleString()}\n`;
    text += `Counter: ${sale.counterName}\n`;
    text += `Cashier: ${sale.cashierName || sale.cashierUsername}\n`;
    text += `Payment Method: ${sale.paymentMethod.toUpperCase()}\n`;
    text += `-----------------------------------\n`;
    text += `ITEMS:\n`;
    (sale.items || []).forEach((item, index) => {
      const isWeight = item.sellBy === 'weight' || item.unitType === 'kg' || (item.quantity || 0) % 1 !== 0;
      const qtyText = isWeight ? `${item.quantity}kg` : `${item.quantity}`;
      const itemDisc = (item.discountAmount && item.discountAmount > 0)
        ? item.discountAmount
        : (item.originalPrice && item.originalPrice > item.price ? ((item.originalPrice - item.price) * (item.quantity || 1)) : 0);

      text += `${index + 1}. ${item.name}\n`;
      text += `   Qty: ${qtyText} | Price: ${curr} ${(item.price || 0).toFixed(2)} | Disc: ${itemDisc > 0 ? `-${curr} ${itemDisc.toFixed(2)}` : `${curr} 0.00`} | Total: ${curr} ${(item.total || 0).toFixed(2)}\n`;
    });
    text += `-----------------------------------\n`;
    text += `SUBTOTAL:       ${curr} ${(subtotal || 0).toFixed(2)}\n`;
    text += `TOTAL DISCOUNT: ${totalDiscount > 0 ? `-${curr} ${totalDiscount.toFixed(2)}` : `${curr} 0.00`}\n`;
    text += `-----------------------------------\n`;
    text += `TOTAL AMOUNT:   ${curr} ${(sale.totalAmount || 0).toFixed(2)}\n`;
    if (sale.paymentMethod === 'cash' && sale.cashReceived !== undefined) {
      text += `CASH RECEIVED:   ${curr} ${(sale.cashReceived || 0).toFixed(2)}\n`;
      text += `CHANGE RETURNED: ${curr} ${(sale.changeReturned || 0).toFixed(2)}\n`;
    }
    text += `===================================\n`;
    text += `  ${receiptFooterText}  \n`;
    text += `===================================\n`;
    return text;
  };

  const getReceiptHtmlContent = () => {
    if (!sale) return '';
    const storeName = store?.name || 'SUPERMARKET';
    const dateStr = new Date(sale.timestamp).toLocaleString();
    const { totalDiscount, subtotal } = getDiscountMetrics();
    const fontFamily = store?.receiptFontFamily || 'Courier New';
    const fontWeight = store?.receiptFontBold ? 'bold' : 'normal';
    const fontStyle = store?.receiptFontItalic ? 'italic' : 'normal';
    const borderRadiusVal = store?.receiptBorderRadius === 'rounded-none' ? '0px'
      : store?.receiptBorderRadius === 'rounded-md' ? '6px'
      : store?.receiptBorderRadius === 'rounded-3xl' ? '24px'
      : '16px';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>E-Receipt #${sale.receiptNumber} - ${storeName}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            body {
              font-family: ${fontFamily}, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              font-weight: ${fontWeight};
              font-style: ${fontStyle};
              max-width: 440px;
              margin: 15px auto;
              padding: 15px;
              color: #0f172a;
              background: #f8fafc;
              font-size: 12px;
              line-height: 1.35;
            }
            .card {
              background: #fff;
              border: 2px solid #0f172a;
              border-radius: ${borderRadiusVal};
              padding: 16px;
              box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
            }
            .bordered-box {
              border: 1px solid #cbd5e1;
              border-radius: 12px;
              padding: 10px;
              margin-bottom: 10px;
              background: #f8fafc;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .uppercase { text-transform: uppercase; }
            .store-title { font-size: 17px; font-weight: 900; color: #0f172a; margin-bottom: 2px; }
            .sub-title { font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 0.5px; }
            .meta-line { font-size: 11px; color: #475569; }
            .meta-table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fff; margin-bottom: 10px; }
            .meta-table td { border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 11px; }
            .items-table { width: 100%; table-layout: fixed; box-sizing: border-box; border-collapse: collapse; border: 1px solid #94a3b8; border-radius: 8px; overflow: hidden; margin: 10px 0; }
            .items-table th { border: 1px solid #94a3b8; background: #f1f5f9; color: #0f172a; font-weight: 800; text-align: left; padding: 5px 2px; font-size: 9px; text-transform: uppercase; overflow: hidden; white-space: nowrap; }
            .items-table td { border: 1px solid #cbd5e1; padding: 5px 2px; font-size: 9.5px; vertical-align: middle; background: #fff; overflow: hidden; }
            .items-table tr:nth-child(even) td { background: #f8fafc; }
            .summary-card { border: 2px solid #0f172a; border-radius: 12px; overflow: hidden; margin-top: 10px; background: #fff; }
            .summary-row { display: flex; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
            .summary-row:last-child { border-bottom: none; }
            .total-row { display: flex; justify-content: space-between; padding: 8px 10px; font-size: 14px; font-weight: 900; background: #0f172a; color: #fff; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; font-size: 10px; font-weight: 800; }
            .download-btn { display: block; width: 100%; padding: 12px; background: #ea580c; color: #fff; text-align: center; font-weight: bold; text-decoration: none; border-radius: 12px; margin-top: 14px; font-size: 13px; border: none; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="card">
            <!-- Store Header Box -->
            <div class="bordered-box text-center">
              <span class="badge">OFFICIAL SALES INVOICE</span>
              <div class="store-title" style="margin-top: 6px;">${storeName}</div>
              <div class="sub-title">${receiptSubHeader}</div>
              ${receiptGreetingMessage ? `<div style="font-size: 10px; font-weight: bold; color: #c2410c; margin-top: 2px;">"${receiptGreetingMessage}"</div>` : ''}
              ${store?.address ? `<div class="meta-line" style="margin-top: 2px;">${store.address}</div>` : ''}
              ${store?.phone ? `<div class="meta-line font-bold">Tel: ${store.phone}</div>` : ''}
              ${store?.taxRegistrationNumber ? `<div class="meta-line font-bold" style="color: #0f172a;">${store.taxRegistrationNumber}</div>` : ''}
            </div>

            <!-- Metadata Box -->
            <table class="meta-table">
              <tr>
                <td><strong>Receipt #:</strong> #${sale.receiptNumber}</td>
                <td class="text-right"><strong>Date:</strong> ${dateStr}</td>
              </tr>
              <tr>
                <td><strong>Counter:</strong> ${sale.counterName}</td>
                <td class="text-right"><strong>Cashier:</strong> ${sale.cashierName || sale.cashierUsername}</td>
              </tr>
              <tr>
                <td><strong>Payment:</strong> <span class="uppercase font-bold" style="color: #ea580c;">${sale.paymentMethod}</span></td>
                <td class="text-right">${sale.onlineTransactionId ? `<strong>Ref:</strong> ${sale.onlineTransactionId}` : '<strong>Status:</strong> COMPLETED'}</td>
              </tr>
            </table>

            <!-- All-Sides Bordered Line Items Table -->
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 28%;">Product Name</th>
                  <th class="text-center" style="width: 11%;">Qty</th>
                  <th class="text-right" style="width: 18%;">Price</th>
                  <th class="text-right" style="width: 19%; color: #047857;">Discount</th>
                  <th class="text-right" style="width: 24%;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${(sale.items || []).map(item => {
                  const isWeight = item.sellBy === 'weight' || item.unitType === 'kg' || (item.quantity || 0) % 1 !== 0;
                  const qtyText = isWeight ? `${(item.quantity || 0) % 1 === 0 ? (item.quantity || 0) : (item.quantity || 0).toFixed(3)} kg` : (item.quantity || 0).toString();
                  const itemDisc = (item.discountAmount && item.discountAmount > 0)
                    ? item.discountAmount
                    : (item.originalPrice && item.originalPrice > item.price ? ((item.originalPrice - item.price) * (item.quantity || 1)) : 0);
                  return `
                    <tr>
                      <td>
                        <strong>${item.name}</strong>
                        ${item.weightInfo ? `<br/><small style="color:#64748b">${item.weightInfo}</small>` : ''}
                      </td>
                      <td class="text-center font-bold">${qtyText}</td>
                      <td class="text-right">${curr} ${(item.price || 0).toFixed(2)}${isWeight ? '/kg' : ''}</td>
                      <td class="text-right" style="color: ${itemDisc > 0 ? '#047857' : '#64748b'}; font-weight: ${itemDisc > 0 ? 'bold' : 'normal'};">
                        ${itemDisc > 0 ? `-${curr} ${itemDisc.toFixed(2)}` : `${curr} 0.00`}
                      </td>
                      <td class="text-right font-bold">${curr} ${(item.total || 0).toFixed(2)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>

            <!-- All-Sides Bordered Totals & Settlement Box -->
            <div class="summary-card">
              <div class="summary-row" style="background: #f8fafc; color: #475569;">
                <span>Subtotal:</span>
                <span class="font-bold">${curr} ${(subtotal || 0).toFixed(2)}</span>
              </div>
              <div class="summary-row" style="background: #ecfdf5; color: #047857; font-weight: bold;">
                <span>Total Discount:</span>
                <span>${totalDiscount > 0 ? `-${curr} ${totalDiscount.toFixed(2)}` : `${curr} 0.00`}</span>
              </div>
              <div class="total-row">
                <span>GRAND TOTAL:</span>
                <span style="color: #fb923c;">${curr} ${(sale.totalAmount || 0).toFixed(2)}</span>
              </div>
              ${sale.paymentMethod === 'cash' && sale.cashReceived !== undefined ? `
                <div class="summary-row" style="background: #f8fafc;">
                  <span>Cash Received:</span>
                  <span class="font-bold">${curr} ${(sale.cashReceived || 0).toFixed(2)}</span>
                </div>
                <div class="summary-row" style="background: #ecfdf5; color: #047857; font-weight: bold;">
                  <span>Change Returned:</span>
                  <span>${curr} ${(sale.changeReturned || 0).toFixed(2)}</span>
                </div>
              ` : ''}
            </div>

            <!-- All-Sides Bordered Footer Box -->
            <div class="bordered-box text-center" style="margin-top: 10px; margin-bottom: 0;">
              <p class="font-bold" style="margin: 0; font-size: 11px; color: #0f172a;">${receiptFooterText}</p>
              <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Verified Receipt #${sale.receiptNumber} &bull; Retain for return</div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Detect base public URL for QR code (always uses public preview endpoint so mobile devices never hit 403 Forbidden)
  const getPublicAppBaseUrl = () => {
    if (typeof window === 'undefined') return 'https://ais-pre-tmjddyvpgndkt25xrveelm-532990536644.asia-southeast1.run.app';
    let currentOrigin = window.location.origin;

    // Replace internal dev environment subdomain with public preview subdomain
    if (currentOrigin.includes('ais-dev-')) {
      currentOrigin = currentOrigin.replace('ais-dev-', 'ais-pre-');
    }

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !currentOrigin.startsWith('http')) {
      return 'https://ais-pre-tmjddyvpgndkt25xrveelm-532990536644.asia-southeast1.run.app';
    }
    return currentOrigin;
  };

  // Helper to build direct, fast, self-contained E-Receipt URL
  const getReceiptDirectUrl = (): string => {
    if (!sale) return '';
    const baseUrl = getPublicAppBaseUrl();
    return `${baseUrl}?receiptId=${encodeURIComponent(sale.id || sale.receiptNumber)}&no=${encodeURIComponent(sale.receiptNumber)}`;
  };

  const receiptUrl = sale ? getReceiptDirectUrl() : '';

  // Generate QR Code for E-Receipt (encodes live receipt URL or custom QR picture/data)
  useEffect(() => {
    if (!sale) return;

    if (store?.receiptQrImageUrl) {
      setQrCodeDataUrl(store.receiptQrImageUrl);
      return;
    }

    let isMounted = true;
    const generateQr = async () => {
      try {
        const targetUrl = store?.receiptQrData || receiptUrl || `${getPublicAppBaseUrl()}?receiptId=${sale.id}&no=${sale.receiptNumber}`;
        
        const dataUrl = await QRCode.toDataURL(targetUrl, {
          width: 360,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        });
        if (isMounted) {
          setQrCodeDataUrl(dataUrl);
        }
      } catch (err) {
        console.error('Failed to generate QR Code for E-Receipt:', err);
        try {
          const fallbackUrl = `${getPublicAppBaseUrl()}?receiptId=${sale.id}`;
          const dataUrl = await QRCode.toDataURL(fallbackUrl, { width: 360, margin: 2 });
          if (isMounted) {
            setQrCodeDataUrl(dataUrl);
          }
        } catch (e2) {
          console.error('Fallback QR code also failed:', e2);
        }
      }
    };

    generateQr();
    return () => {
      isMounted = false;
    };
  }, [sale, store, receiptUrl]);

  // Keydown listener for modal escape close
  useEffect(() => {
    if (!isOpen || !sale) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, sale, onClose]);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    setPrintStatus('Opening printer interface...');
    try {
      printThermalReceiptDirect(sale, store, qrCodeDataUrl);
      setPrintStatus('Print dialog opened!');
    } catch (err) {
      console.warn('Error during print invocation:', err);
      try {
        window.print();
        setPrintStatus('Print dialog opened!');
      } catch (e) {
        setPrintStatus('Press Ctrl+P to print');
      }
    }
    setTimeout(() => setPrintStatus(null), 3500);
  };

  const handleOpenPrintWindow = () => {
    try {
      const html = getReceiptHtmlContent();
      const printWin = window.open('', '_blank', 'width=450,height=700');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
          try {
            printWin.print();
          } catch (_) {}
        }, 300);
      } else {
        handlePrint();
      }
    } catch (_) {
      handlePrint();
    }
  };

  const handleCopyText = () => {
    const text = getFormattedReceiptText();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleCopyLink = () => {
    if (!receiptUrl) return;
    navigator.clipboard.writeText(receiptUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 3000);
  };

  const handleDownloadImage = async () => {
    const element = receiptCardRef.current || document.getElementById('thermal-receipt-preview');
    if (!element) return;

    setIsExportingImage(true);
    try {
      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `Receipt-${sale?.receiptNumber || 'bill'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to generate image:', err);
    } finally {
      setIsExportingImage(false);
    }
  };

  const handleDownloadText = () => {
    const text = getFormattedReceiptText();
    const element = document.createElement('a');
    const file = new Blob([text], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `Receipt-${sale.receiptNumber}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleDownloadHtml = () => {
    const html = getReceiptHtmlContent();
    const element = document.createElement('a');
    const file = new Blob([html], { type: 'text/html' });
    element.href = URL.createObjectURL(file);
    element.download = `E-Receipt-${sale.receiptNumber}.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleShare = async () => {
    const text = getFormattedReceiptText();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Receipt #${sale.receiptNumber}`,
          text: text
        });
      } catch (err) {
        console.log('Share canceled or error:', err);
      }
    } else {
      handleCopyText();
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto overscroll-contain animate-fade-in">
      
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative space-y-5 max-h-[92vh] flex flex-col my-auto overflow-y-auto overscroll-contain custom-scrollbar">
        
        {/* Header (Hidden during print) */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 no-print shrink-0 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-200 shadow-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Checkout Completed</h3>
              <p className="text-xs text-slate-500 font-medium">Transaction Receipt #{sale.receiptNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* THANK YOU VOICE BANNER */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-3.5 rounded-2xl shadow-md no-print flex items-center justify-between gap-3 border border-emerald-500 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm shrink-0">
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold tracking-wide uppercase text-white">
                Thank You For Shopping at {store?.name || sale?.storeName || 'Our Store'}!
              </h4>
              <p className="text-[10px] text-emerald-100 font-medium">
                Total: <strong className="text-white font-bold">{curr} {sale.totalAmount.toFixed(2)}</strong> &bull; #{sale.receiptNumber}
              </p>
            </div>
          </div>

          {isVoiceAllowed && (
            <button
              type="button"
              onClick={handleReplayVoice}
              className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 transition-all cursor-pointer border border-white/30 shrink-0"
              title="Play voice thank you greeting again"
            >
              <Volume2 className="w-3.5 h-3.5 text-amber-300" /> Speak 🔊
            </button>
          )}
        </div>

        {/* Print Status Feedback */}
        {printStatus && (
          <div className="px-4 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 no-print animate-fade-in shrink-0">
            <Printer className="w-4 h-4 text-emerald-600 animate-pulse" />
            <span>{printStatus}</span>
          </div>
        )}

        {/* SLIP RETENTION & SALES PERMANENCE BANNER */}
        {isSlipExpired(sale) ? (
          <div className="px-3.5 py-2 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs flex items-center justify-between gap-2 no-print shrink-0">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold">Customer Slip Cleared (7-Day Policy)</span>
                <p className="text-[11px] text-amber-700 font-normal">
                  Public customer slip expired after 7 days. Store sales ledger, profit, and stock records are permanently preserved.
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-200/60 text-amber-900 shrink-0">
              Sales Permanent
            </span>
          </div>
        ) : (
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-[11px] flex items-center justify-between gap-2 no-print shrink-0">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Customer Online Slip: Active ({getReceiptRemainingDays(sale.timestamp)} days left)</span>
            </div>
            <span className="text-[10px] text-emerald-700 font-semibold shrink-0">
              Sales Data Permanent
            </span>
          </div>
        )}

        {/* COMPACT CASH TRANSACTION BREAKDOWN & CHANGE RETURN CARD */}
        {sale.paymentMethod === 'cash' && (
          <div className="bg-slate-900 border border-emerald-500/50 rounded-xl px-3.5 py-2.5 text-white shadow-sm no-print shrink-0 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <Coins className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="truncate">
                <span className="font-extrabold text-emerald-400">Cash Settlement:</span>
                <span className="text-slate-300 ml-1.5 text-[11px]">
                  Bill: <strong className="text-white">{curr} {sale.totalAmount.toFixed(2)}</strong> &bull; 
                  Recv: <strong className="text-emerald-400">{curr} {(sale.cashReceived ?? sale.totalAmount).toFixed(2)}</strong>
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <div className="bg-emerald-950/90 px-3 py-1 rounded-lg border border-emerald-500/60 text-right">
                <span className="text-[9px] uppercase font-bold text-emerald-400 block">Change Due</span>
                <span className="text-sm font-black font-mono text-emerald-300">
                  {curr} {(sale.changeReturned ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* STANDARD PRINTABLE RECEIPT CARD */}
            <div 
              id="printable-receipt" 
              className={`text-slate-900 overflow-y-auto overscroll-contain max-h-[62vh] custom-scrollbar bg-white p-4 sm:p-5 rounded-2xl border-2 border-slate-800 font-mono text-xs space-y-3 shadow-lg ${
                store?.receiptFormat === 'classic_detailed'
                  ? 'border-4 border-double border-slate-900'
                  : ''
              }`}
            >
              {/* Optional Black & White Store Logo */}
              {store?.logoUrl && (
                <div className="flex justify-center pb-0.5">
                  <img
                    src={store.logoUrl}
                    alt={store.name || 'Store Logo'}
                    className="max-h-14 max-w-[180px] object-contain filter grayscale contrast-200"
                  />
                </div>
              )}

              {/* 1. All-Sides Bordered Store Header Box */}
              <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/80 text-center space-y-1 shadow-2xs">
                <div className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-[9px] font-black uppercase tracking-wider">
                  Verified Sales Slip
                </div>
                <div className="font-black text-base sm:text-lg tracking-tight text-slate-900 uppercase pt-0.5">
                  {store?.name || 'SUPERMARKET'}
                </div>
                <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">
                  {receiptSubHeader}
                </div>
                {receiptGreetingMessage && (
                  <div className="text-[10px] font-bold text-orange-700 italic pt-0.5">
                    "{receiptGreetingMessage}"
                  </div>
                )}
                {store?.address && (
                  <div className="text-[10px] text-slate-600 font-medium">{store.address}</div>
                )}
                {store?.phone && (
                  <div className="text-[10px] text-slate-700 font-bold">Tel / Helpline: {store.phone}</div>
                )}
                {store?.taxRegistrationNumber && (
                  <div className="text-[10px] text-slate-800 font-extrabold">{store.taxRegistrationNumber}</div>
                )}
              </div>

              {/* 2. All-Sides Bordered Metadata Grid Box */}
              <div className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-2xs">
                <table className="w-full border-collapse text-[10.5px]">
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="p-2 border-r border-slate-200 bg-slate-50/60 text-slate-600">
                        Receipt: <strong className="text-slate-900 font-mono">#{sale.receiptNumber}</strong>
                      </td>
                      <td className="p-2 text-right text-slate-600 font-medium">
                        {new Date(sale.timestamp).toLocaleString()}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2 border-r border-slate-200 text-slate-600">
                        Counter: <strong className="text-slate-800">{sale.counterName}</strong>
                      </td>
                      <td className="p-2 text-right text-slate-600">
                        Cashier: <strong className="text-slate-800">{sale.cashierName || sale.cashierUsername}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 border-r border-slate-200 text-slate-600">
                        Payment: <strong className="uppercase text-orange-700 font-bold">{sale.paymentMethod}</strong>
                      </td>
                      <td className="p-2 text-right font-mono text-[10px] text-slate-500">
                        {sale.onlineTransactionId ? `Ref: ${sale.onlineTransactionId}` : 'Status: COMPLETED'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 3. All-Sides Bordered Items Table */}
              <div className="border border-slate-400 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] font-black uppercase text-slate-800">
                      <th className="p-2 border border-slate-300 w-[38%]">Product Name</th>
                      <th className="p-2 border border-slate-300 text-center w-[14%]">Qty</th>
                      <th className="p-2 border border-slate-300 text-right w-[16%]">Price</th>
                      <th className="p-2 border border-slate-300 text-right w-[16%] text-emerald-800">Discount</th>
                      <th className="p-2 border border-slate-300 text-right w-[16%]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sale.items || []).map((item, idx) => {
                      const isWeight = item.sellBy === 'weight' || item.unitType === 'kg' || (item.quantity || 0) % 1 !== 0;
                      const qtyDisplay = isWeight ? `${(item.quantity || 0) % 1 === 0 ? (item.quantity || 0) : (item.quantity || 0).toFixed(3)}kg` : (item.quantity || 0).toString();
                      const itemDisc = (item.discountAmount && item.discountAmount > 0)
                        ? item.discountAmount
                        : (item.originalPrice && item.originalPrice > item.price ? ((item.originalPrice - item.price) * (item.quantity || 1)) : 0);

                      return (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                          <td className="p-2 border border-slate-200 font-semibold text-slate-900 text-[11px] leading-tight">
                            <span className="block truncate" title={item.name}>{item.name}</span>
                            {item.weightInfo && (
                              <span className="block text-[9px] text-slate-500 font-normal">{item.weightInfo}</span>
                            )}
                          </td>
                          <td className="p-2 border border-slate-200 text-center font-bold font-mono text-slate-800 text-[11px]">{qtyDisplay}</td>
                          <td className="p-2 border border-slate-200 text-right text-slate-700 font-mono text-[11px]">{curr} {(item.price || 0).toFixed(2)}</td>
                          <td className="p-2 border border-slate-200 text-right font-mono text-[11px]">
                            {itemDisc > 0 ? (
                              <span className="text-emerald-700 font-bold">-{curr} {itemDisc.toFixed(2)}</span>
                            ) : (
                              <span className="text-slate-400 font-normal">{curr} 0.00</span>
                            )}
                          </td>
                          <td className="p-2 border border-slate-200 text-right font-extrabold text-slate-900 font-mono text-[11px]">{curr} ${(item.total || 0).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 4. All-Sides Bordered Settlement & Totals Card */}
              {(() => {
                const { totalDiscount, subtotal } = getDiscountMetrics();
                return (
                  <div className="border-2 border-slate-800 rounded-xl overflow-hidden bg-white shadow-2xs">
                    <div className="flex justify-between p-2 text-xs bg-slate-50/80 border-b border-slate-200 text-slate-700">
                      <span className="font-semibold">Subtotal:</span>
                      <span className="font-mono font-bold">{curr} {(subtotal || 0).toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between p-2 text-xs bg-emerald-50/70 border-b border-slate-200 text-emerald-800 font-bold">
                      <span>Total Discount:</span>
                      <span className="font-mono">
                        {totalDiscount > 0 ? `-${curr} ${totalDiscount.toFixed(2)}` : `${curr} 0.00`}
                      </span>
                    </div>

                    <div className="flex justify-between p-2.5 text-sm sm:text-base font-black bg-slate-900 text-white">
                      <span>GRAND TOTAL:</span>
                      <span className="text-amber-400 font-mono">{curr} {(sale.totalAmount || 0).toFixed(2)}</span>
                    </div>

                    {sale.paymentMethod === 'cash' && sale.cashReceived !== undefined && (
                      <div className="grid grid-cols-2 border-t border-slate-200 bg-slate-50 text-[11px]">
                        <div className="p-2 border-r border-slate-200 flex justify-between text-slate-700">
                          <span>Cash Received:</span>
                          <span className="font-mono font-bold">{curr} {(sale.cashReceived || 0).toFixed(2)}</span>
                        </div>
                        <div className="p-2 flex justify-between text-emerald-800 font-bold bg-emerald-50/60">
                          <span>Change:</span>
                          <span className="font-mono font-black">{curr} {(sale.changeReturned || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 5. All-Sides Bordered Footer & Policy Note */}
              <div className="border border-slate-300 rounded-xl p-3 bg-slate-50 text-center space-y-1 text-[10px] shadow-2xs">
                <p className="font-bold text-slate-800">{receiptFooterText}</p>
                {store?.address && (
                  <p className="text-[9px] text-slate-500">{store.address}</p>
                )}
                <div className="text-[9px] text-slate-400 pt-0.5">
                  Official Invoice #{sale.receiptNumber} &bull; Retain for return & exchange
                </div>
              </div>

              {/* 6. Optional All-Sides Bordered QR Code Box */}
              {isQrEnabled && qrCodeDataUrl && (
                <div className="border border-slate-300 rounded-xl p-3 bg-white text-center space-y-1.5 shadow-2xs">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                    {qrTitle}
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200 inline-block shadow-2xs">
                    <img 
                      src={qrCodeDataUrl} 
                      alt={qrTitle} 
                      className="w-24 h-24 sm:w-28 sm:h-28 object-contain"
                    />
                  </div>
                  <div className="text-[9px] text-slate-500 font-mono">
                    Scan to view digital invoice #{sale.receiptNumber}
                  </div>
                </div>
              )}
            </div>

            {/* Action Controls for Printing, Sharing, and Emailing */}
            <div className="grid grid-cols-3 gap-2 no-print pt-2 border-t border-slate-200 shrink-0">
              <button
                onClick={handlePrint}
                className="py-3 px-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 active:scale-[0.98] text-white font-black rounded-xl shadow-md hover:shadow-lg transition-all text-xs flex items-center justify-center gap-1 cursor-pointer"
                title="Print thermal receipt"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" /> Print
              </button>

              <button
                onClick={handleShare}
                className="py-3 px-2.5 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-800 font-bold border border-slate-200 rounded-xl transition-all text-xs flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
              >
                <Share2 className="w-3.5 h-3.5 shrink-0 text-orange-600" /> Share
              </button>

              <button
                onClick={() => setIsSendMailModalOpen(true)}
                className="py-3 px-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
              >
                <Mail className="w-3.5 h-3.5 shrink-0" /> E-Mail
              </button>
            </div>

            {sale && store && (
              <SendEReceiptModal
                isOpen={isSendMailModalOpen}
                onClose={() => setIsSendMailModalOpen(false)}
                sale={sale}
                store={store}
              />
            )}

      </div>
    </div>
  );
};
