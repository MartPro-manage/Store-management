import { Sale, Store, ProductReturn } from '../types';

export function getThermalReceiptInnerHtml(sale: Sale, store?: Store | null, qrCodeDataUrl?: string | null): string {
  const storeName = store?.name || sale?.storeName || 'SUPERMARKET';
  const curr = store?.currencySymbol || 'Rs.';
  const receiptSubHeader = store?.receiptHeader || 'OFFICIAL SALES INVOICE';
  const receiptGreetingMessage = store?.receiptGreeting || 'Welcome & Thank You for Shopping With Us!';
  const receiptFooterText = store?.receiptFooter || `THANK YOU FOR SHOPPING AT ${storeName.toUpperCase()}! Please retain slip for return.`;
  const isQrEnabled = Boolean(store?.receiptQrCodeEnabled);
  const qrTitle = store?.receiptQrTitle || 'Scan to Verify Receipt';
  const dateStr = new Date(sale.timestamp).toLocaleString();

  const itemDiscounts = (sale.items || []).reduce((sum, item) => {
    if (item.originalPrice && item.originalPrice > item.price) {
      return sum + ((item.originalPrice - item.price) * (item.quantity || 1));
    }
    if (item.discountAmount && item.discountAmount > 0) {
      return sum + item.discountAmount;
    }
    return sum;
  }, 0);

  const billDiscount = Number(sale.discountAmount || 0);
  const totalDiscount = Math.max(billDiscount, itemDiscounts);
  const subtotal = sale.subtotalAmount || ((sale.totalAmount || 0) + totalDiscount);

  return `
    <div style="font-family: 'Courier New', Courier, monospace, -apple-system, sans-serif; width: 78mm; max-width: 100%; margin: 0 auto; padding: 6px; color: #000; background: #fff; font-size: 11px; line-height: 1.35; box-sizing: border-box; border: 2px solid #000;">
      <!-- Store Header Box with All-Side Borders -->
      <div style="border: 1px solid #000; padding: 6px; text-align: center; margin-bottom: 6px; background: #fff;">
        ${store?.logoUrl ? `<img src="${store.logoUrl}" alt="Logo" style="max-height: 44px; max-width: 160px; margin: 0 auto 4px auto; display: block; filter: grayscale(100%) contrast(200%);" />` : ''}
        <div style="font-size: 15px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">${storeName}</div>
        <div style="font-size: 10px; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase;">${receiptSubHeader}</div>
        ${receiptGreetingMessage ? `<div style="font-size: 9px; font-style: italic; margin-top: 2px;">"${receiptGreetingMessage}"</div>` : ''}
        ${store?.address ? `<div style="font-size: 9.5px; margin-top: 2px;">${store.address}</div>` : ''}
        ${store?.phone ? `<div style="font-size: 9.5px; font-weight: bold;">Tel: ${store.phone}</div>` : ''}
        ${store?.taxRegistrationNumber ? `<div style="font-size: 9.5px; font-weight: bold;">${store.taxRegistrationNumber}</div>` : ''}
      </div>

      <!-- Metadata Box with All-Side Borders -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 10px; border: 1px solid #000;">
        <tr>
          <td style="border: 1px solid #000; padding: 3px 4px;">Receipt: <strong>#${sale.receiptNumber}</strong></td>
          <td style="border: 1px solid #000; padding: 3px 4px; text-align: right;">${dateStr}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 3px 4px;">Counter: <strong>${sale.counterName}</strong></td>
          <td style="border: 1px solid #000; padding: 3px 4px; text-align: right;">Cashier: <strong>${sale.cashierName || sale.cashierUsername}</strong></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 3px 4px;">Payment: <strong style="text-transform: uppercase;">${sale.paymentMethod}</strong></td>
          <td style="border: 1px solid #000; padding: 3px 4px; text-align: right;">${sale.onlineTransactionId ? `Ref: ${sale.onlineTransactionId}` : 'PAID'}</td>
        </tr>
      </table>

      <!-- Items Table with All-Side Borders on all Cells -->
      <table style="width: 100%; table-layout: fixed; box-sizing: border-box; border-collapse: collapse; margin-bottom: 6px; font-size: 9.5px; border: 1px solid #000;">
        <thead>
          <tr style="text-transform: uppercase; background: #eee;">
            <th style="border: 1px solid #000; text-align: left; padding: 3px 2px; width: 28%; overflow: hidden; white-space: nowrap;">Item</th>
            <th style="border: 1px solid #000; text-align: center; padding: 3px 1px; width: 11%; overflow: hidden;">Qty</th>
            <th style="border: 1px solid #000; text-align: right; padding: 3px 2px; width: 18%; overflow: hidden; white-space: nowrap;">Price</th>
            <th style="border: 1px solid #000; text-align: right; padding: 3px 2px; width: 19%; overflow: hidden; white-space: nowrap;">Disc</th>
            <th style="border: 1px solid #000; text-align: right; padding: 3px 2px; width: 24%; overflow: hidden; white-space: nowrap;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${(sale.items || []).map((item) => {
            const isWeight = item.sellBy === 'weight' || item.unitType === 'kg' || (item.quantity || 0) % 1 !== 0;
            const qtyText = isWeight 
              ? `${(item.quantity || 0) % 1 === 0 ? item.quantity : Number(item.quantity).toFixed(3)}kg` 
              : item.quantity.toString();
            const itemDisc = (item.discountAmount && item.discountAmount > 0)
              ? item.discountAmount
              : (item.originalPrice && item.originalPrice > item.price ? ((item.originalPrice - item.price) * (item.quantity || 1)) : 0);
            return `
              <tr>
                <td style="border: 1px solid #000; padding: 3px 4px; vertical-align: top;">
                  <strong>${item.name}</strong>
                  ${item.weightInfo ? `<br/><span style="font-size: 8.5px;">${item.weightInfo}</span>` : ''}
                </td>
                <td style="border: 1px solid #000; text-align: center; padding: 3px 2px; font-weight: bold; vertical-align: top;">${qtyText}</td>
                <td style="border: 1px solid #000; text-align: right; padding: 3px 2px; vertical-align: top;">${(item.price || 0).toFixed(2)}</td>
                <td style="border: 1px solid #000; text-align: right; padding: 3px 2px; vertical-align: top; font-weight: ${itemDisc > 0 ? 'bold' : 'normal'};">
                  ${itemDisc > 0 ? `-${(itemDisc).toFixed(2)}` : '0.00'}
                </td>
                <td style="border: 1px solid #000; text-align: right; padding: 3px 2px; font-weight: bold; vertical-align: top;">${(item.total || 0).toFixed(2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <!-- Totals Box with All-Side Borders -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 11px; border: 2px solid #000;">
        <tr>
          <td style="border: 1px solid #000; padding: 3px 6px;">Subtotal:</td>
          <td style="border: 1px solid #000; padding: 3px 6px; text-align: right; font-weight: bold;">${curr} ${(subtotal || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 3px 6px;">Total Discount:</td>
          <td style="border: 1px solid #000; padding: 3px 6px; text-align: right; font-weight: bold;">${totalDiscount > 0 ? `-${curr} ${totalDiscount.toFixed(2)}` : `${curr} 0.00`}</td>
        </tr>
        <tr style="background: #000; color: #fff;">
          <td style="border: 1px solid #000; padding: 4px 6px; font-weight: 900; font-size: 13px;">NET TOTAL:</td>
          <td style="border: 1px solid #000; padding: 4px 6px; text-align: right; font-weight: 900; font-size: 13px;">${curr} ${(sale.totalAmount || 0).toFixed(2)}</td>
        </tr>
        ${sale.paymentMethod === 'cash' && sale.cashReceived !== undefined ? `
          <tr>
            <td style="border: 1px solid #000; padding: 3px 6px;">Cash Tendered:</td>
            <td style="border: 1px solid #000; padding: 3px 6px; text-align: right; font-weight: bold;">${curr} ${(sale.cashReceived || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 3px 6px;">Change Returned:</td>
            <td style="border: 1px solid #000; padding: 3px 6px; text-align: right; font-weight: bold;">${curr} ${(sale.changeReturned || 0).toFixed(2)}</td>
          </tr>
        ` : ''}
      </table>

      <!-- Footer Box with All-Side Borders -->
      <div style="border: 1px solid #000; padding: 5px; text-align: center; font-size: 9.5px; background: #fff;">
        <p style="font-weight: bold; margin: 0 0 2px 0;">${receiptFooterText}</p>
        <div>Txn Ref: #${sale.receiptNumber}</div>
      </div>

      ${isQrEnabled && qrCodeDataUrl ? `
        <div style="border: 1px solid #000; padding: 5px; text-align: center; margin-top: 6px;">
          <div style="font-size: 9px; font-weight: bold; text-transform: uppercase; margin-bottom: 3px;">${qrTitle}</div>
          <img src="${qrCodeDataUrl}" alt="${qrTitle}" style="width: 75px; height: 75px; margin: 0 auto; display: block;" />
        </div>
      ` : ''}
    </div>
  `;
}

export function getThermalReceiptHtml(sale: Sale, store?: Store | null, qrCodeDataUrl?: string | null): string {
  const storeName = store?.name || sale?.storeName || 'SUPERMARKET';
  const inner = getThermalReceiptInnerHtml(sale, store, qrCodeDataUrl);
  const fontFamily = store?.receiptFontFamily || 'Courier New';
  const fontWeight = store?.receiptFontBold ? 'bold' : 'normal';
  const fontStyle = store?.receiptFontItalic ? 'italic' : 'normal';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Receipt #${sale.receiptNumber} - ${storeName}</title>
    <style>
      @page {
        size: 80mm auto;
        margin: 0;
      }
      * {
        box-sizing: border-box;
      }
      body {
        width: 78mm;
        max-width: 100%;
        margin: 0 auto;
        padding: 4px;
        color: #000;
        background: #fff;
        font-family: '${fontFamily}', Courier, monospace, sans-serif;
        font-weight: ${fontWeight};
        font-style: ${fontStyle};
      }
      @media print {
        body {
          width: 78mm;
          padding: 0;
          margin: 0 auto;
        }
      }
    </style>
    <script>
      window.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() {
          try {
            window.focus();
            window.print();
          } catch (e) {
            console.warn(e);
          }
        }, 150);
      });
    </script>
  </head>
  <body>
    ${inner}
  </body>
</html>`;
}

/**
 * Universal, isolated thermal printing via multi-strategy print engine (Blob Window, Popup, Iframe & Direct)
 */
export function printReceiptHtmlDirect(htmlContent: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // 1. Try opening dedicated print window (Blob URL / popup) - Bypasses iframe sandbox restrictions
      let printWin: Window | null = null;
      try {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        printWin = window.open(blobUrl, '_blank', 'width=460,height=750,menubar=no,toolbar=no,location=no,status=no');
        if (printWin) {
          printWin.onload = () => {
            try {
              printWin?.focus();
              printWin?.print();
            } catch (_) {}
          };
          setTimeout(() => {
            try {
              printWin?.focus();
              printWin?.print();
            } catch (_) {}
          }, 250);
          resolve(true);
          return;
        }
      } catch (blobErr) {
        console.warn('Blob window open error:', blobErr);
      }

      // 2. Try window.open document.write
      try {
        printWin = window.open('', '_blank', 'width=460,height=750');
        if (printWin) {
          printWin.document.open();
          printWin.document.write(htmlContent);
          printWin.document.close();
          printWin.focus();
          setTimeout(() => {
            try {
              printWin?.print();
            } catch (_) {}
          }, 250);
          resolve(true);
          return;
        }
      } catch (openErr) {
        console.warn('Direct popup open error:', openErr);
      }

      // 3. Try hidden iframe printing
      let iframe = document.getElementById('thermal-direct-print-iframe') as HTMLIFrameElement | null;
      if (iframe) {
        try { iframe.remove(); } catch (_) {}
      }

      iframe = document.createElement('iframe');
      iframe.id = 'thermal-direct-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.opacity = '0.01';
      iframe.style.pointerEvents = 'none';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (iframeDoc && iframe.contentWindow) {
        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();

        const runIframePrint = () => {
          try {
            if (iframe?.contentWindow) {
              iframe.contentWindow.focus();
              iframe.contentWindow.print();
              resolve(true);
            } else {
              window.print();
              resolve(true);
            }
          } catch (e) {
            console.warn('Iframe print failed, falling back to window.print():', e);
            try {
              window.print();
              resolve(true);
            } catch (_) {
              resolve(false);
            }
          }
        };

        if (iframeDoc.readyState === 'complete') {
          setTimeout(runIframePrint, 120);
        } else {
          iframe.onload = () => setTimeout(runIframePrint, 120);
          setTimeout(runIframePrint, 350);
        }
        return;
      }

      // 4. Final fallback: window.print()
      window.print();
      resolve(true);
    } catch (err) {
      console.warn('Print preparation error, trying direct window.print:', err);
      try {
        window.print();
        resolve(true);
      } catch (fallbackErr) {
        console.error('Direct window.print failed:', fallbackErr);
        resolve(false);
      }
    }
  });
}

export function printThermalReceiptDirect(sale: Sale, store?: Store | null, qrCodeDataUrl?: string | null): Promise<boolean> {
  const fullHtml = getThermalReceiptHtml(sale, store, qrCodeDataUrl);
  return printReceiptHtmlDirect(fullHtml);
}

export function printReturnSlipDirect(returnRecord: ProductReturn, store?: Store | null): Promise<boolean> {
  const storeName = store?.name || returnRecord.storeName || 'SUPERMARKET';
  const dateStr = new Date(returnRecord.timestamp).toLocaleString();
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
  const curr = store?.currencySymbol || 'Rs.';

  const slipHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Return Slip #${returnRecord.returnSlipNumber} - ${storeName}</title>
    <style>
      @page {
        size: 80mm auto;
        margin: 0;
      }
      * {
        box-sizing: border-box;
      }
      body {
        font-family: 'Courier New', Courier, monospace;
        width: 78mm;
        margin: 0 auto;
        padding: 8px;
        color: #000;
        background: #fff;
        font-size: 11px;
        line-height: 1.35;
      }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .font-bold { font-weight: bold; }
      .uppercase { text-transform: uppercase; }
      .divider { border-top: 1px dashed #000; margin: 6px 0; }
      .double-divider { border-top: 2px solid #000; margin: 6px 0; }
      .store-title { font-size: 16px; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 2px; text-transform: uppercase; }
      .sub-title { font-size: 11px; font-weight: bold; letter-spacing: 0.5px; color: #b91c1c; margin-bottom: 4px; text-transform: uppercase; }
      .flex-row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 11px; }
      th { border-bottom: 1px solid #000; text-align: left; padding: 3px 0; font-size: 10px; text-transform: uppercase; }
      td { padding: 3px 0; font-size: 11px; vertical-align: top; }
      .total-box { font-size: 14px; font-weight: 900; margin-top: 6px; color: #b91c1c; }
    </style>
  </head>
  <body>
    <div class="text-center">
      <div class="store-title">${storeName}</div>
      <div class="sub-title">CUSTOMER RETURN & REFUND VOUCHER</div>
      <div>Slip No: <strong>#${returnRecord.returnSlipNumber}</strong></div>
      <div style="font-size: 10px; color: #444;">${dateStr}</div>
    </div>

    <div class="divider"></div>

    <div>
      <div class="flex-row"><span>Counter:</span><strong>${returnRecord.counterName}</strong></div>
      <div class="flex-row"><span>Cashier:</span><strong>${returnRecord.cashierName || returnRecord.cashierUsername}</strong></div>
      <div class="flex-row"><span>Refund Mode:</span><strong class="uppercase">${returnRecord.refundMethod} REFUND</strong></div>
      ${returnRecord.originalReceiptNumber ? `<div class="flex-row"><span>Orig. Invoice:</span><strong>#${returnRecord.originalReceiptNumber}</strong></div>` : ''}
    </div>

    <div class="divider"></div>

    <table>
      <thead>
        <tr>
          <th>Returned Item</th>
          <th class="text-center">Qty</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Refund Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsList.map(item => `
          <tr>
            <td>
              <strong>${item.productName}</strong>
              ${item.barcode ? `<div style="font-size: 9px; color: #555;">Code: ${item.barcode}</div>` : ''}
            </td>
            <td class="text-center font-bold">${item.quantity}</td>
            <td class="text-right">${curr} ${(item.price || 0).toFixed(2)}</td>
            <td class="text-right font-bold">${curr} ${(item.refundAmount || 0).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="double-divider"></div>

    <div class="flex-row total-box">
      <span>TOTAL REFUNDED:</span>
      <span>${curr} ${(returnRecord.refundAmount ?? 0).toFixed(2)}</span>
    </div>

    ${returnRecord.reason ? `
      <div style="margin-top: 6px; font-size: 10px;">
        <strong>Return Reason:</strong> ${returnRecord.reason}
      </div>
    ` : ''}

    <div style="margin-top: 6px; font-size: 10px; color: #047857;">
      ✔ Restock Status: <strong>${totalUnits} unit(s) returned to store inventory</strong>
    </div>

    <div class="divider"></div>

    <div class="text-center" style="margin-top: 10px;">
      <p class="font-bold" style="margin: 0; font-size: 10px;">REFUND PROCESSED BY ${storeName.toUpperCase()}</p>
      <p style="margin: 2px 0 0 0; font-size: 9px; color: #555;">Amount deducted from sales register & returned to inventory.</p>
      <div style="font-size: 9px; font-weight: bold; margin-top: 4px;">Ref: ${returnRecord.returnSlipNumber}</div>
    </div>
  </body>
</html>`;

  return printReceiptHtmlDirect(slipHtml);
}
