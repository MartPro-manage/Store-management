import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';
import { Sale, Store, SentReceiptLog } from '../types';
import { db as martDb, collection as martCollection, addDoc as martAddDoc, cleanFirestoreData } from './firebase';

// Reuse existing Firebase App or initialize
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Use Google Auth Provider configured with Gmail send scope
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/gmail.send');
// Allow users to choose ANY Google Account from the Google account chooser
provider.setCustomParameters({
  prompt: 'select_account'
});

// In-memory & local session caching of the access token and connected email
let cachedAccessToken: string | null = null;
let cachedGmailAddress: string | null = null;
let isSigningIn = false;

// Initialize cached token from localStorage if present
try {
  const savedToken = localStorage.getItem('martpro_gmail_token');
  const savedEmail = localStorage.getItem('martpro_gmail_email');
  if (savedToken) cachedAccessToken = savedToken;
  if (savedEmail) cachedGmailAddress = savedEmail;
} catch (e) {
  // Local storage unavailable in some private windows
}

// Clear in-memory token on sign out
onAuthStateChanged(auth, (user: User | null) => {
  if (!user && !isSigningIn) {
    cachedAccessToken = null;
    cachedGmailAddress = null;
    try {
      localStorage.removeItem('martpro_gmail_token');
      localStorage.removeItem('martpro_gmail_email');
    } catch (e) {}
  }
});

/**
 * Modern UTF-8 safe base64url encoder
 */
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Trigger Google Login specifically for Gmail OAuth Access Token
 * Presents the Google Account selector so any user can choose ANY of their accounts
 */
export async function authenticateWithGmail(): Promise<{ accessToken: string; email: string }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error('Google did not return a Gmail API access token. Please grant email sending permission.');
    }

    cachedAccessToken = accessToken;
    cachedGmailAddress = result.user.email || '';
    
    try {
      localStorage.setItem('martpro_gmail_token', accessToken);
      localStorage.setItem('martpro_gmail_email', cachedGmailAddress);
    } catch (e) {}

    return { accessToken, email: cachedGmailAddress };
  } catch (err: any) {
    console.error('[Gmail Auth Error]:', err);
    throw err;
  } finally {
    isSigningIn = false;
  }
}

export function getCachedGmailToken(): string | null {
  return cachedAccessToken;
}

export function getCachedGmailAddress(): string | null {
  return cachedGmailAddress;
}

export function setCachedGmailToken(token: string | null, email: string | null) {
  cachedAccessToken = token;
  cachedGmailAddress = email;
  try {
    if (token) {
      localStorage.setItem('martpro_gmail_token', token);
      if (email) localStorage.setItem('martpro_gmail_email', email);
    } else {
      localStorage.removeItem('martpro_gmail_token');
      localStorage.removeItem('martpro_gmail_email');
    }
  } catch (e) {}
}

export function disconnectGmail() {
  cachedAccessToken = null;
  cachedGmailAddress = null;
  try {
    localStorage.removeItem('martpro_gmail_token');
    localStorage.removeItem('martpro_gmail_email');
  } catch (e) {}
}

/**
 * Format standard RFC 2822 HTML message and dispatch directly via Google Gmail API
 */
export async function sendEmailViaGmailApi({
  accessToken,
  fromEmail,
  toEmail,
  subject,
  bodyHtml
}: {
  accessToken: string;
  fromEmail?: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // UTF-8 encoded subject
    const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

    // RFC 2822 MIME headers
    const headers = [
      fromEmail ? `From: ${fromEmail}` : '',
      `To: ${toEmail}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit'
    ].filter(Boolean).join('\r\n');

    // Combine headers with unencoded raw HTML body, then encode the entire message in base64url
    const rawEmailString = `${headers}\r\n\r\n${bodyHtml}`;
    const base64UrlEmail = base64UrlEncode(rawEmailString);

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: base64UrlEmail
      })
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      const message = errorJson?.error?.message || `Gmail API error (${response.status})`;
      throw new Error(message);
    }

    const data = await response.json().catch(() => ({}));
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    console.error('[Gmail Direct Send Error]:', err);
    return { success: false, error: err?.message || 'Failed to dispatch email via Gmail API' };
  }
}

/**
 * Main Direct E-Receipt Dispatch:
 * Sends receipt directly via Gmail API using connected account,
 * records the event permanently in `sent_receipts` Firestore database.
 */
export async function sendDirectEReceipt({
  toEmail,
  sale,
  store
}: {
  toEmail: string;
  sale: Sale;
  store: Store;
}): Promise<{ success: boolean; logId?: string; senderEmail?: string; error?: string }> {
  const cleanToEmail = (toEmail || '').trim();
  if (!cleanToEmail || !cleanToEmail.includes('@') || !cleanToEmail.includes('.')) {
    return { success: false, error: 'Please enter a valid customer email address.' };
  }

  const receiptNo = sale.receiptNumber || `#${(sale.id || 'SALE').slice(-6).toUpperCase()}`;
  const storeName = store.name || sale.storeName || 'Mart Pro Supermarket';
  const currency = store.currencySymbol || 'Rs.';
  const totalAmount = (sale.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicReceiptUrl = `${origin}/?receiptId=${sale.id || receiptNo}&no=${encodeURIComponent(receiptNo)}`;
  const emailHtml = generateReceiptHtml(sale, store, publicReceiptUrl);
  const emailSubject = `E-Receipt ${receiptNo} - ${storeName}`;

  let token = cachedAccessToken;
  let senderEmail = cachedGmailAddress || auth.currentUser?.email || 'supermarketmanage@gmail.com';

  // If token is missing, attempt to authenticate
  if (!token) {
    try {
      const authResult = await authenticateWithGmail();
      token = authResult.accessToken;
      senderEmail = authResult.email || senderEmail;
    } catch (authErr: any) {
      // User cancelled popup or denied permissions
      return { 
        success: false, 
        error: authErr?.message || 'Please connect your Google / Gmail account to dispatch receipts directly.' 
      };
    }
  }

  // Dispatch directly via Google Gmail API
  const sendResult = await sendEmailViaGmailApi({
    accessToken: token,
    fromEmail: senderEmail,
    toEmail: cleanToEmail,
    subject: emailSubject,
    bodyHtml: emailHtml
  });

  if (!sendResult.success) {
    // If token expired, clear cache and return error
    if (sendResult.error?.includes('401') || sendResult.error?.toLowerCase().includes('token') || sendResult.error?.toLowerCase().includes('credential')) {
      cachedAccessToken = null;
      return {
        success: false,
        error: 'Gmail session expired. Please click "Sign in with Google" again to reconnect.'
      };
    }
    return { success: false, error: sendResult.error };
  }

  // Permanently record in Firestore sent_receipts collection
  const now = new Date();
  const nowIso = now.toISOString();
  const itemsSummary = (sale.items || []).map(item => `${item.name} (${item.quantity} ${item.unitType || 'pcs'})`).join(', ');

  const logData: Omit<SentReceiptLog, 'id'> = {
    storeId: store.id || sale.storeId || 'main',
    storeName: storeName,
    receiptNumber: receiptNo,
    saleId: sale.id || receiptNo,
    customerEmail: cleanToEmail,
    senderEmail: senderEmail,
    totalAmount: sale.totalAmount || 0,
    currencySymbol: currency,
    paymentMethod: sale.paymentMethod || 'cash',
    itemsCount: (sale.items || []).length,
    cashierName: sale.cashierName || sale.cashierUsername || 'Cashier',
    sentAt: nowIso,
    status: 'sent',
    receiptUrl: publicReceiptUrl,
    itemsSummary: itemsSummary.slice(0, 300)
  };

  let savedLogId = 'log_' + Date.now();
  try {
    const logDocRef = await martAddDoc(martCollection(martDb, 'sent_receipts'), cleanFirestoreData(logData));
    savedLogId = logDocRef.id;
  } catch (logErr) {
    console.warn('[Sent Receipt Log] Warning recording receipt log:', logErr);
  }

  return {
    success: true,
    logId: savedLogId,
    senderEmail
  };
}

/**
 * Generates beautifully styled, ultra-detailed HTML email receipt for Gmail
 * Optimized for Gmail mobile & desktop clients, supporting all store metadata,
 * item breakdown, regular vs discounted prices, tax, cashier, and change returned.
 */
export function generateReceiptHtml(sale: Sale, store: Store, publicReceiptUrl: string): string {
  const receiptNo = sale.receiptNumber || `#${(sale.id || 'SALE').slice(-6).toUpperCase()}`;
  const storeName = store.name || sale.storeName || 'Mart Pro';
  const currency = store.currencySymbol || 'Rs.';
  const totalAmount = (sale.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  
  // Calculate subtotal, item discounts, and savings
  let grossSubtotal = 0;
  let totalItemDiscounts = 0;

  const itemsList = sale.items || [];
  itemsList.forEach(item => {
    const qty = Number(item.quantity) || 1;
    const itemPrice = Number(item.price) || 0;
    const origPrice = Number(item.originalPrice) || itemPrice;
    
    grossSubtotal += origPrice * qty;
    if (origPrice > itemPrice) {
      totalItemDiscounts += (origPrice - itemPrice) * qty;
    } else if (item.discountAmount && item.discountAmount > 0) {
      totalItemDiscounts += Number(item.discountAmount);
    }
  });

  const billDiscount = Number(sale.discountAmount) || 0;
  const totalSavings = totalItemDiscounts + billDiscount;
  const subtotalBeforeDiscounts = grossSubtotal > 0 ? grossSubtotal : (sale.subtotalAmount || sale.totalAmount || 0);

  const formattedDate = new Date(sale.timestamp || Date.now()).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  const paymentMethodLabel = (sale.paymentMethod || 'cash').toUpperCase();
  const cashierDisplay = sale.cashierName || sale.cashierUsername || 'mart Admin';

  const itemsRowsHtml = itemsList.map((item) => {
    const unitLabel = item.unitType ? ` ${item.unitType}` : '';
    const itemPrice = Number(item.price) || 0;
    const origPrice = Number(item.originalPrice) || itemPrice;
    const qty = Number(item.quantity) || 1;
    const itemTotal = Number(item.total) || (itemPrice * qty);
    const hasDiscount = origPrice > itemPrice || (item.discountAmount && item.discountAmount > 0);
    const itemDiscountVal = hasDiscount ? (origPrice > itemPrice ? (origPrice - itemPrice) * qty : Number(item.discountAmount)) : 0;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 14px 10px; vertical-align: top; text-align: left;">
          <div style="font-weight: 700; color: #0f172a; font-size: 14px;">${item.name}</div>
          ${item.barcode ? `<div style="font-size: 11px; color: #64748b; font-family: monospace; margin-top: 2px;">#${item.barcode}</div>` : ''}
          ${hasDiscount ? `
            <div style="font-size: 11px; color: #16a34a; font-weight: 600; margin-top: 2px;">
              Orig: ${currency} ${origPrice.toFixed(2)} (-${currency} ${itemDiscountVal.toFixed(2)})
            </div>
          ` : ''}
        </td>
        <td style="padding: 14px 10px; text-align: center; vertical-align: middle; font-size: 14px; color: #334155; font-weight: 500;">
          ${qty}${unitLabel}
        </td>
        <td style="padding: 14px 10px; text-align: right; vertical-align: middle; font-size: 14px; color: #475569;">
          ${currency} ${itemPrice.toFixed(2)}
        </td>
        <td style="padding: 14px 10px; text-align: right; vertical-align: middle; font-size: 14px; font-weight: 700; color: #0f172a;">
          ${currency} ${itemTotal.toFixed(2)}
        </td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${storeName} Receipt ${receiptNo}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; padding: 32px 28px 24px 28px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">
    
    <!-- Header Title matching screenshot -->
    <div style="text-align: center; margin-bottom: 20px;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 900; color: #ea580c; letter-spacing: -0.5px;">
        ${storeName}
      </h1>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #475569; font-weight: 600;">
        Official Digital Sales Invoice
      </p>
      ${store.address ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">${store.address} ${store.phone ? `• ${store.phone}` : ''}</p>` : ''}
    </div>

    <!-- Orange Divider Line -->
    <div style="height: 2px; background-color: #ea580c; width: 100%; margin-bottom: 22px; border-radius: 2px;"></div>

    <!-- Soft Rounded Metadata Box matching screenshot -->
    <div style="background-color: #f8fafc; border: 1px solid #edf2f7; border-radius: 12px; padding: 14px 18px; margin-bottom: 22px; font-size: 13px; line-height: 1.8;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 2px 0; text-align: left; color: #334155;">
            <strong style="color: #0f172a;">Receipt #:</strong> ${receiptNo}
          </td>
          <td style="padding: 2px 0; text-align: right; color: #334155;">
            <strong style="color: #0f172a;">Date:</strong> ${formattedDate}
          </td>
        </tr>
        <tr>
          <td style="padding: 2px 0; text-align: left; color: #334155;">
            <strong style="color: #0f172a;">Cashier:</strong> ${cashierDisplay}
          </td>
          <td style="padding: 2px 0; text-align: right; color: #334155;">
            <strong style="color: #0f172a;">Payment:</strong> ${paymentMethodLabel}
          </td>
        </tr>
      </table>
    </div>

    <!-- Items Table Header pill matching screenshot -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
      <thead>
        <tr style="background-color: #f1f5f9; color: #475569; text-transform: uppercase; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">
          <th style="padding: 10px 10px; text-align: left; border-top-left-radius: 8px; border-bottom-left-radius: 8px;">ITEM</th>
          <th style="padding: 10px 10px; text-align: center;">QTY</th>
          <th style="padding: 10px 10px; text-align: right;">PRICE</th>
          <th style="padding: 10px 10px; text-align: right; border-top-right-radius: 8px; border-bottom-right-radius: 8px;">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRowsHtml}
      </tbody>
    </table>

    <!-- Financial Totals Section matching screenshot -->
    <div style="padding-top: 10px; margin-bottom: 24px;">
      <div style="font-size: 14px; color: #64748b; margin-bottom: 8px; font-weight: 500;">
        Subtotal: ${currency} ${subtotalBeforeDiscounts.toFixed(2)}
      </div>

      ${totalSavings > 0 ? `
        <div style="font-size: 13px; color: #16a34a; margin-bottom: 8px; font-weight: 700;">
          Discount Savings: -${currency} ${totalSavings.toFixed(2)}
        </div>
      ` : ''}

      <div style="font-size: 22px; font-weight: 900; color: #0f172a; margin-top: 6px; letter-spacing: -0.5px;">
        Total Paid: <span style="color: #ea580c; font-weight: 900;">${currency} ${totalAmount}</span>
      </div>

      ${sale.paymentMethod === 'cash' && (sale.cashReceived || 0) > 0 ? `
        <div style="font-size: 12px; color: #64748b; margin-top: 6px;">
          Cash Received: ${currency} ${(sale.cashReceived || 0).toFixed(2)} • Change Returned: <strong style="color: #047857;">${currency} ${(sale.changeReturned || 0).toFixed(2)}</strong>
        </div>
      ` : ''}
    </div>

    <!-- Action Link & Download Button -->
    <div style="text-align: center; padding-top: 18px; border-top: 1px solid #f1f5f9;">
      <a href="${publicReceiptUrl}" target="_blank" style="display: inline-block; background-color: #ea580c; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; padding: 12px 28px; border-radius: 10px; box-shadow: 0 4px 10px rgba(234, 88, 12, 0.25);">
        View & Download E-Receipt Pass
      </a>
      <p style="font-size: 11px; color: #94a3b8; margin: 16px 0 0 0;">
        ${store.receiptFooter || 'Thank you for shopping with us! Please retain this email for your records.'}
      </p>
    </div>

  </div>

</body>
</html>
  `;
}
