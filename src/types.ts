export type UserRole = 
  | 'super_admin' 
  | 'store_admin' 
  | 'admin' 
  | 'branch_admin' 
  | 'cash_counter' 
  | 'product_register' 
  | 'customer_price_checker'
  | (string & {});

export interface Store {
  id: string;
  name: string;
  specialStoreId?: string; // Special assigned Store ID
  isLinked?: boolean; // Interconnected status
  adminUsername: string;
  adminPassword?: string;
  status?: 'active' | 'disabled';
  parentStoreId?: string; // If this is a branch of a parent chain/store
  storeAdminId?: string; // Store Admin user ID who owns/manages this chain
  storeAdminUsername?: string; // Store Admin username
  isBranch?: boolean; // Indicates whether this is an individual branch
  branchCode?: string; // e.g. "BR-01"
  branchAdminUsername?: string; // Assigned branch admin username
  branchAdminName?: string; // Assigned branch admin name
  branchAdminSalary?: number; // Monthly branch admin salary / administrative cost set by store admin
  administrativeExpenses?: number; // Additional monthly administrative overhead
  cameraScannerEnabled?: boolean; // Super admin can enable/disable inbuilt barcode camera for each store
  voiceAnnouncementEnabled?: boolean; // Super admin can allow/disallow audio voice generation for each store
  phone?: string;
  address?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  receiptGreeting?: string; // Custom greeting message on receipt
  receiptQrCodeEnabled?: boolean; // Option to enable QR code on receipt
  receiptQrTitle?: string; // Title above the QR code on receipt
  receiptQrData?: string; // Custom URL or info for the QR code (defaults to verified receipt link)
  receiptQrImageUrl?: string; // Uploaded custom picture/image of the QR code instead of link
  logoUrl?: string; // Black & white store logo (data URL or image URL)
  receiptFormat?: 'standard' | 'classic_detailed' | 'compact_eco'; // 3 distinct receipt templates
  receiptFontFamily?: string;
  receiptFontBold?: boolean;
  receiptFontItalic?: boolean;
  receiptBorderRadius?: string;
  taxRegistrationNumber?: string;
  lowStockAlertThreshold?: number;
  currencySymbol?: string;
  returnPolicyDays?: number;
  soundEffectsEnabled?: boolean;
  customCategories?: string[];
  adminGmail?: string; // Custom Admin Gmail address for sending receipts directly via Gmail API
  digitalPaymentMethods?: DigitalPaymentMethodConfig[];
  bankAccount?: StoreBankAccount; // Store bank account entered by admin in payment method option
  bankAccounts?: StoreBankAccount[]; // All configured store bank accounts
  createdAt: string;
}

export interface StoreBankAccount {
  id: string;
  bankName: string; // e.g. "Meezan Bank", "Habib Bank Limited (HBL)", "MCB", "Allied Bank", etc.
  accountTitle: string; // e.g. "Supermarket Mart Official"
  accountNumber: string; // e.g. "0101-2345678-01"
  iban?: string; // e.g. "PK36MEZN0001012345678001"
  raastId?: string; // e.g. "03001234567"
  branchName?: string;
  branchCode?: string;
  qrCodeUrl?: string; // custom QR picture for scanning to pay
  instructions?: string; // cashier or customer guidance
  isActive: boolean;
  isPrimary?: boolean;
}

export interface DigitalPaymentMethodConfig {
  id: string;
  name: string; // e.g. "EasyPaisa", "JazzCash", "Raast", "SadaPay", "NayaPay", "Bank Transfer", etc.
  accountTitle?: string;
  accountNumber?: string;
  qrCodeUrl?: string; // custom QR image for this specific digital payment method
  instructions?: string;
  isActive: boolean;
}

export interface Expense {
  id: string;
  storeId: string;
  name: string;
  amount: number;
  category?: string;
  notes?: string;
  date: string; // YYYY-MM-DD
  paymentMethod?: 'cash' | 'online';
  timestamp: string; // ISO string
  recordedBy?: string;
  salaryPaymentId?: string;
}

export interface SalaryPayment {
  id: string;
  storeId: string;
  parentStoreId?: string;
  staffId: string;
  staffName: string;
  staffRole: UserRole;
  staffUsername: string;
  month: string; // "YYYY-MM" e.g. "2026-03"
  monthName?: string; // e.g. "March 2026"
  baseSalary: number;
  bonusAmount?: number;
  deductionAmount?: number;
  amountPaid: number;
  paymentMethod: 'cash' | 'online';
  paymentDate: string; // YYYY-MM-DD
  notes?: string;
  paidByUsername: string;
  paidByName: string;
  expenseId?: string; // Linked ID in 'expenses' collection
  createdAt: string; // ISO string
}

export interface StaffSessionLog {
  id: string;
  storeId: string;
  userId: string;
  userName?: string;
  username?: string;
  staffName?: string;
  staffUsername?: string;
  role: UserRole;
  counterName?: string;
  counterNumber?: string;
  loginTime: string; // ISO string
  logoutTime?: string | null; // ISO string
  status: 'online' | 'offline' | 'active';
  lastActive?: string;
  totalSalesCount?: number;
  totalSalesAmount?: number;
}

export type StaffSession = StaffSessionLog;

export interface StaffAttendanceRecord {
  id: string;
  storeId: string; // Branch ID
  parentStoreId?: string; // Parent store chain ID
  staffId: string; // UserAccount ID
  staffName: string;
  staffUsername: string;
  staffRole: UserRole;
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent' | 'late' | 'half_day' | 'leave';
  checkInTime?: string; // e.g. "09:00 AM"
  checkOutTime?: string; // e.g. "06:00 PM"
  workingHours?: number;
  notes?: string;
  markedByUsername?: string;
  markedByRole?: string;
  timestamp: string; // ISO string
}

export interface UserAccount {
  id: string;
  storeId: string; // 'all' for super_admin, or branch storeId
  storeName?: string;
  parentStoreId?: string; // Parent store chain ID if branch staff
  role: UserRole;
  username: string;
  password?: string;
  name: string;
  counterNumber?: string; // for cash counter
  salary?: number; // Monthly base salary set by branch admin / store admin
  salaryFrequency?: 'monthly' | 'weekly';
  phone?: string;
  designation?: string;
  hireDate?: string;
  status?: 'active' | 'inactive';
  createdAt: string;
}

export interface Product {
  id: string;
  storeId: string;
  barcode: string;
  shortcutCode?: string; // 4-digit unique shortcut code e.g. "1001"
  serialNumber?: string;
  name: string;
  imageUrl?: string; // Product picture URL or base64 data URI
  category: string;
  costPrice?: number; // Purchase/Cost price per unit or per kg
  price: number; // Selling price per piece or price per kg
  stockQuantity: number; // Total stock pieces or total weight in kg
  minStockLevel?: number;
  weight?: string; // Text description e.g. "1 kg", "500 g", "Loose"
  sellBy?: 'unit' | 'weight'; // 'unit' (per piece/pack) or 'weight' (per kg/grams)
  unitType?: 'piece' | 'kg' | 'g' | 'liter' | 'dozen';
  pricePerKg?: number; // Rate per kg
  weightPerUnit?: number; // Weight in kg per single pack/piece (e.g. 0.5 for 500g pack)
  discountType?: 'percentage' | 'fixed'; // percentage (%) or fixed (Rs.)
  discountValue?: number; // e.g. 10 for 10% or 50 for Rs. 50
  discountActive?: boolean; // Whether discount is currently active on this product
  discountStartDate?: string; // Date (YYYY-MM-DD) from which discount is applicable
  discountEndDate?: string; // Date (YYYY-MM-DD) until which discount is applicable (expiry date)
  updatedAt: string;
  createdAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number; // Quantity in units or total weight in kg (can be decimal)
  totalPrice: number;
  enteredWeight?: number;
  weightMultiplier?: number;
}

export interface SaleItem {
  productId: string;
  barcode: string;
  shortcutCode?: string;
  serialNumber?: string;
  name: string;
  costPrice?: number; // Purchase/Cost price at time of sale
  price: number; // Unit price or per kg rate (discounted selling price)
  originalPrice?: number; // Regular catalog price before admin discount
  discountAmount?: number; // Discount saved on this item
  quantity: number; // Quantity or weight (decimal supported)
  total: number;
  sellBy?: 'unit' | 'weight';
  unitType?: string;
  weightInfo?: string;
}

export interface HeldBill {
  id: string;
  storeId: string;
  counterId?: string;
  counterName?: string;
  cashierName?: string;
  cashierUsername?: string;
  customerName?: string;
  notes?: string;
  items: CartItem[];
  subtotal: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  discountAmount?: number;
  total: number;
  heldAt: string; // ISO string
  isAutoHeld?: boolean; // True if held automatically due to logout or computer shutdown
}

export interface SupplierOrderItem {
  id: string;
  productId?: string;
  name: string;
  category?: string;
  barcode?: string;
  shortcutCode?: string;
  currentStock?: number;
  orderQuantity: number;
  unitType?: string;
  costPrice?: number;
  estimatedTotal?: number;
  checked?: boolean;
}

export interface SupplierOrder {
  id: string;
  storeId: string;
  supplierName: string;
  contactNumber: string;
  items: SupplierOrderItem[];
  status: 'pending' | 'ordered' | 'delivered';
  paymentTerms?: 'advance' | 'cod';
  advancePaidAmount?: number;
  codPaidAmount?: number;
  totalPaidAmount?: number;
  paymentExpenseId?: string;
  deliveryExpenseId?: string;
  notes?: string;
  totalEstimatedAmount?: number;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
}

export interface Sale {
  id: string;
  storeId: string;
  storeName?: string;
  counterId: string;
  counterName: string;
  cashierName?: string;
  cashierUsername: string;
  items: SaleItem[];
  subtotalAmount?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  discountAmount?: number;
  totalAmount: number;
  paymentMethod: 'cash' | 'online';
  onlinePaymentProvider?: string; // e.g. "EasyPaisa", "JazzCash", "SadaPay", "Bank Transfer", etc.
  onlineTransactionId?: string; // Optional reference or transaction confirmation ID
  cashReceived?: number;
  changeReturned?: number;
  receiptNumber: string;
  timestamp: string;
  expiresAt?: string;
  isSlipDeleted?: boolean;
  slipExpired?: boolean;
  slipDeletedAt?: string;
}

export interface ProductReturnItem {
  productId: string;
  productName: string;
  barcode?: string;
  serialNumber?: string;
  shortcutCode?: string;
  price: number;
  quantity: number;
  sellBy?: 'unit' | 'weight';
  unitType?: string;
  refundAmount: number;
  reason?: string;
}

export interface ProductReturn {
  id: string;
  storeId: string;
  storeName?: string;
  counterId: string;
  counterName: string;
  cashierName?: string;
  cashierUsername: string;
  productId: string;
  productName: string;
  barcode: string;
  serialNumber?: string;
  price: number;
  quantity: number;
  sellBy?: 'unit' | 'weight';
  unitType?: string;
  refundAmount: number;
  refundMethod: 'cash' | 'online';
  reason?: string;
  items?: ProductReturnItem[];
  originalReceiptNumber?: string;
  returnSlipNumber: string;
  timestamp: string;
}

export interface AuthState {
  user: UserAccount | null;
  store: Store | null;
}

export interface SentReceiptLog {
  id: string;
  storeId: string;
  storeName: string;
  receiptNumber: string;
  saleId: string;
  customerEmail: string;
  senderEmail: string; // 'supermarketmanage@gmail.com'
  totalAmount: number;
  currencySymbol: string;
  paymentMethod: string;
  itemsCount: number;
  cashierName?: string;
  sentAt: string; // ISO string
  status: 'sent' | 'delivered';
  receiptUrl?: string;
  itemsSummary?: string;
  errorMessage?: string;
}
