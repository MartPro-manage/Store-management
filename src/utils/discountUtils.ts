import { Product } from '../types';

export interface ProductDiscountInfo {
  hasDiscount: boolean;
  basePrice: number;
  effectivePrice: number;
  discountedPrice: number;
  discountAmount: number;
  discountLabel: string;
  discountType: 'percentage' | 'fixed' | null;
  discountValue: number;
  isDateActive: boolean;
  isExpired: boolean;
  isUpcoming: boolean;
  dateStatusMessage: string;
  startDate?: string;
  endDate?: string;
  daysRemaining?: number;
}

/**
 * Checks if a discount is currently active based on optional start and end dates.
 * Dates are expected in "YYYY-MM-DD" format.
 */
export function checkDiscountDateValidity(startDate?: string, endDate?: string): {
  isDateActive: boolean;
  isExpired: boolean;
  isUpcoming: boolean;
  dateStatusMessage: string;
  daysRemaining?: number;
} {
  // If no date restrictions exist, the discount is always valid
  if (!startDate && !endDate) {
    return {
      isDateActive: true,
      isExpired: false,
      isUpcoming: false,
      dateStatusMessage: 'Ongoing (No expiration)'
    };
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  const cleanStart = startDate ? (startDate.includes('T') ? startDate.split('T')[0] : startDate.trim()) : '';
  const cleanEnd = endDate ? (endDate.includes('T') ? endDate.split('T')[0] : endDate.trim()) : '';

  // 1. Check if upcoming (starts in future)
  if (cleanStart && todayStr < cleanStart) {
    const startD = new Date(`${cleanStart}T00:00:00`);
    const todayD = new Date(`${todayStr}T00:00:00`);
    const diffDays = Math.ceil((startD.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24));
    return {
      isDateActive: false,
      isExpired: false,
      isUpcoming: true,
      dateStatusMessage: `Starts in ${diffDays} day${diffDays > 1 ? 's' : ''} (${formatShortDate(cleanStart)})`
    };
  }

  // 2. Check if expired (ended in past)
  if (cleanEnd && todayStr > cleanEnd) {
    return {
      isDateActive: false,
      isExpired: true,
      isUpcoming: false,
      dateStatusMessage: `Expired on ${formatShortDate(cleanEnd)}`
    };
  }

  // 3. Currently active
  if (cleanEnd) {
    const endD = new Date(`${cleanEnd}T23:59:59`);
    const todayD = new Date(`${todayStr}T00:00:00`);
    const diffDays = Math.ceil((endD.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24));
    
    let msg = '';
    if (diffDays === 0 || diffDays === 1 && todayStr === cleanEnd) {
      msg = 'Expires Today!';
    } else if (diffDays <= 1) {
      msg = 'Expires Tomorrow!';
    } else {
      msg = `Valid until ${formatShortDate(cleanEnd)} (${diffDays} days left)`;
    }

    return {
      isDateActive: true,
      isExpired: false,
      isUpcoming: false,
      daysRemaining: diffDays,
      dateStatusMessage: msg
    };
  }

  if (cleanStart) {
    return {
      isDateActive: true,
      isExpired: false,
      isUpcoming: false,
      dateStatusMessage: `Active since ${formatShortDate(cleanStart)} (Ongoing)`
    };
  }

  return {
    isDateActive: true,
    isExpired: false,
    isUpcoming: false,
    dateStatusMessage: 'Active'
  };
}

/**
 * Format "YYYY-MM-DD" into a friendly readable date e.g. "25 Sep 2026"
 */
export function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = clean.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${months[monthIdx] || parts[1]} ${year}`;
    }
  } catch (e) {
    // fallback
  }
  return dateStr;
}

/**
 * Calculates discount details for a given product considering date validity limits.
 */
export function getProductDiscountInfo(product: Product): ProductDiscountInfo {
  const basePrice = product.price || 0;
  
  if (!product.discountActive || !product.discountValue || product.discountValue <= 0) {
    return {
      hasDiscount: false,
      basePrice,
      effectivePrice: basePrice,
      discountedPrice: basePrice,
      discountAmount: 0,
      discountLabel: '',
      discountType: null,
      discountValue: 0,
      isDateActive: false,
      isExpired: false,
      isUpcoming: false,
      dateStatusMessage: '',
      startDate: product.discountStartDate,
      endDate: product.discountEndDate
    };
  }

  // Check date limit validity
  const dateCheck = checkDiscountDateValidity(product.discountStartDate, product.discountEndDate);

  if (!dateCheck.isDateActive) {
    // Discount is configured but not active due to date bounds (expired or future scheduled)
    return {
      hasDiscount: false,
      basePrice,
      effectivePrice: basePrice,
      discountedPrice: basePrice,
      discountAmount: 0,
      discountLabel: '',
      discountType: product.discountType || 'percentage',
      discountValue: product.discountValue,
      isDateActive: false,
      isExpired: dateCheck.isExpired,
      isUpcoming: dateCheck.isUpcoming,
      dateStatusMessage: dateCheck.dateStatusMessage,
      startDate: product.discountStartDate,
      endDate: product.discountEndDate,
      daysRemaining: dateCheck.daysRemaining
    };
  }

  let discountAmount = 0;
  let label = '';

  if (product.discountType === 'percentage') {
    discountAmount = Math.min(basePrice, (basePrice * product.discountValue) / 100);
    label = `${product.discountValue}% OFF`;
  } else {
    discountAmount = Math.min(basePrice, product.discountValue);
    label = `Rs. ${product.discountValue} OFF`;
  }

  const effectivePrice = Math.max(0, basePrice - discountAmount);

  return {
    hasDiscount: true,
    basePrice,
    effectivePrice,
    discountedPrice: effectivePrice,
    discountAmount,
    discountLabel: label,
    discountType: product.discountType || 'percentage',
    discountValue: product.discountValue,
    isDateActive: true,
    isExpired: false,
    isUpcoming: false,
    dateStatusMessage: dateCheck.dateStatusMessage,
    startDate: product.discountStartDate,
    endDate: product.discountEndDate,
    daysRemaining: dateCheck.daysRemaining
  };
}

/**
 * Calculates effective selling price for a product.
 */
export function getEffectiveProductPrice(product: Product): number {
  return getProductDiscountInfo(product).effectivePrice;
}

