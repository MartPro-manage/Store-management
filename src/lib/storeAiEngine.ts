import { Product, Sale } from '../types';

export interface AiQueryResult {
  reply: string;
  speechText: string;
  matchedProducts: Product[];
  highlightedProduct: Product | null;
  intent: 'top_selling' | 'cheapest' | 'price_check' | 'stock_check' | 'category_list' | 'store_stat' | 'general' | 'guide';
  categoryTag?: string;
}

/**
 * Normalizes text for matching
 */
function clean(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Token overlap score between query and product name/category
 */
function calculateMatchScore(queryClean: string, p: Product): number {
  const pName = clean(p.name);
  const pCat = clean(p.category || '');
  const pBarcode = (p.barcode || '').trim();
  const pShortcut = (p.shortcutCode || '').trim();

  if (pShortcut && (queryClean.includes(pShortcut.toLowerCase()) || queryClean.includes('#' + pShortcut.toLowerCase()))) return 100;
  if (pBarcode && queryClean.includes(pBarcode.toLowerCase())) return 100;
  if (pName && queryClean.includes(pName)) return 90;

  let score = 0;
  const qTokens = queryClean.split(' ').filter(t => t.length > 1 && !['price', 'of', 'if', 'what', 'is', 'the', 'how', 'much', 'for', 'in', 'show', 'me', 'top', 'selling', 'cheapest', 'best', 'seller'].includes(t));

  if (qTokens.length === 0) return 0;

  qTokens.forEach(token => {
    if (pName.includes(token)) score += 15;
    if (pCat.includes(token)) score += 10;
  });

  return score;
}

/**
 * Extracts category or item target from query
 * e.g. "top selling oil" -> "oil"
 * "cheapest ghee" -> "ghee"
 */
function extractCategoryKeyword(query: string): string | null {
  const q = clean(query);
  const knownKeywords = [
    'oil',
    'ghee',
    'biscuit',
    'biscuits',
    'tea',
    'grain',
    'grains',
    'rice',
    'flour',
    'atta',
    'toy',
    'toys',
    'detergent',
    'soap',
    'soaps',
    'laundry',
    'milk',
    'dairy',
    'beverage',
    'beverages',
    'juice',
    'drink',
    'snack',
    'snacks',
    'spice',
    'spices',
    'vegetable',
    'fruit'
  ];

  for (const kw of knownKeywords) {
    // word boundary check
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(q)) {
      if (kw === 'biscuits') return 'biscuit';
      if (kw === 'grains') return 'grain';
      if (kw === 'toys') return 'toy';
      if (kw === 'soaps') return 'soap';
      return kw;
    }
  }

  return null;
}

/**
 * Primary AI Query Engine for Store, Price Checker & Software Help Guide
 */
export function processStoreAiQuery(
  rawQuery: string,
  products: Product[],
  sales: Sale[] = []
): AiQueryResult {
  const q = clean(rawQuery);
  const targetCategory = extractCategoryKeyword(rawQuery);

  // 0. SOFTWARE FUNCTIONALITY & HOW-TO GUIDES

  // COMBINED SYSTEM GUIDE (POS Counter + Product Register + Software Guide)
  if (
    (q.includes('pos') && (q.includes('product register') || q.includes('register') || q.includes('software guide'))) ||
    (q.includes('how to use pos') && q.includes('register')) ||
    q.includes('pos counter product register') ||
    (q.includes('pos') && q.includes('admin') && q.includes('guide'))
  ) {
    const reply = `📖 **MART PRO MASTER SYSTEM GUIDE: POS COUNTER, PRODUCT REGISTER & ADMIN DASHBOARD**\n\n` +
      `Here is your complete, all-in-one operating manual for running your supermarket:\n\n` +
      `🛒 **1. HOW TO OPERATE THE POS CASH COUNTER:**\n` +
      `   • **Barcode Scanning:** Scan items with any USB/wireless scanner or camera. Full barcodes are auto-matched.\n` +
      `   • **4-Digit Fast Codes:** Cashiers can type any item's 4-digit code (e.g. \`#1001\`) into the barcode box for instant billing.\n` +
      `   • **Scale & Weight Items:** For goods sold by kg/liter (fruits, veg, meat), a weight prompt auto-opens. Type weight in kg (e.g. \`1.25\`) to compute exact price.\n` +
      `   • **Bordered POS Table:** Items appear in a clean table showing Barcode, Name, Qty, Unit Price, Total, and Discount.\n` +
      `   • **Park & Resume Bills:** Press \`H + D\` to hold the current customer's cart, and press \`A + S\` to resume held carts.\n` +
      `   • **Settlement & Change:** Press \`Shift + P\` to complete billing. System calculates change due with voice announcements.\n` +
      `   • **Receipts:** Press \`P\` or \`Ctrl + P\` for instant 80mm/58mm thermal receipts with live QR code e-receipts.\n\n` +
      `📦 **2. HOW TO USE THE PRODUCT REGISTER & CATALOG:**\n` +
      `   • **Single Item Register:** Go to Admin -> Product Register. Enter product Name, Selling Price, Cost Price, Stock, Category, Unit (piece/kg), and Barcode. A unique 4-digit shortcut code (e.g. \`#1001\`) is auto-generated!\n` +
      `   • **Batch Multi-Product Grid:** Click "Batch Register" to enter 10 to 50 products rapidly in a fast spreadsheet grid with Tab navigation.\n` +
      `   • **Excel / CSV Device Upload:** Click "Excel / CSV Import" to upload supplier sheets. Columns are auto-detected (Barcode, Name, Cost, Price, Qty). If an entered barcode already exists in stock, it automatically updates existing stock quantity, cost, and price!\n` +
      `   • **Real-Time Catalog Search:** Search products by name, barcode, or 4-digit code to update prices and stock levels instantly.\n\n` +
      `🏢 **3. STORE ADMIN DASHBOARD FEATURES & HOW TO USE:**\n` +
      `   • **Sales Analytics:** Live revenue KPI cards, gross profit, and 7-day sales line chart.\n` +
      `   • **Audit Log:** Inspect past itemized transaction receipts filtered by date.\n` +
      `   • **Discounts & Promotions:** Create % OFF or Rs. OFF promotions with expiration timers.\n` +
      `   • **Expenses Ledger:** Record operating overheads (rent, salaries) to calculate true Net Operating Profit.\n` +
      `   • **Supplier Orders:** Place purchase orders with automatic stock replenishment upon delivery.\n` +
      `   • **Staff Management:** Track cashier shifts, counter billing, and calculate salaries.\n` +
      `   • **Store Settings:** Configure receipt formats, store logo, address, and voice announcements.`;

    return {
      reply,
      speechText: `Here is your complete guide for POS counter billing, Product register management, and Admin dashboard features.`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // Product Register & Inventory Management Guide
  if (
    q.includes('product register') || 
    q.includes('how to use product register') || 
    q.includes('how to register product') || 
    q.includes('register product') || 
    q.includes('register products') || 
    q.includes('item register') || 
    q.includes('catalog register') || 
    q.includes('how to add product') || 
    q.includes('add product guide') ||
    q.includes('register item') ||
    q.includes('how to register') ||
    q.includes('batch register')
  ) {
    const reply = `📦 **PRODUCT REGISTER & INVENTORY MANAGEMENT GUIDE:**\n\n` +
      `The Product Register allows you to add, manage, and synchronize your store's entire stock catalog:\n\n` +
      `1. 📝 **Single Product Registration:**\n` +
      `   • Click **"Product Register"** in the sidebar -> click **"Add New Product"**.\n` +
      `   • **Required Fields:** Product Name, Category, Retail Selling Price, Wholesale Cost Price, and Stock Quantity.\n` +
      `   • **Unit & Sell By:** Choose *Per Piece* (unit) or *Sell By Weight* (*kg*, *gram*, *liter*).\n` +
      `   • **Barcode Number:** Scan barcode from the physical item, type it manually, or click **"Generate Random Barcode"**.\n` +
      `   • **4-Digit POS Shortcut Code:** The system automatically assigns a consecutive code (e.g. \`#1001\`, \`#1002\`) so cashiers can type \`1001\` for instant billing at checkout!\n` +
      `   • Click **"Save Product"** to register it directly into your live Firestore catalog.\n\n` +
      `2. 📑 **Batch Multi-Product Registration (10 to 50 Items):**\n` +
      `   • Click **"Batch Register"** to open the rapid tabular spreadsheet.\n` +
      `   • Use the **Tab** key to navigate smoothly across rows.\n` +
      `   • Generates unique 4-digit codes automatically for each row.\n` +
      `   • Click **"Save All to Stock"** to commit all items in one click!\n\n` +
      `3. 📊 **Excel / CSV Upload from Your Device:**\n` +
      `   • Click **"Excel / CSV Import"** or drag-and-drop a spreadsheet from your device.\n` +
      `   • **Auto-Column Detection:** Automatically maps Barcode, Product Name, Quantity, Cost Price, Selling Price, and Category.\n` +
      `   • **Automatic Stock Updates:** If a barcode in the spreadsheet already exists in your stock, the system automatically updates the existing record with the new Quantity, Cost Price, and Selling Price!\n\n` +
      `4. 🔍 **Catalog Search, Price Updates & Low-Stock Alerts:**\n` +
      `   • Search any item by name, barcode, or 4-digit shortcut.\n` +
      `   • Update prices or restock levels on the fly.\n` +
      `   • Items falling below their minimum stock alert level appear automatically in the **Low Stock Alerts** widget!`;

    return {
      reply,
      speechText: `In Product Register, you can add single items, use batch registration for 50 items at once, or upload Excel spreadsheets with automatic barcode stock updates.`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // POS Counter & Cash Register Operating Guide
  if (
    q.includes('pos') || 
    q.includes('cash register') || 
    q.includes('cash counter') || 
    q.includes('billing counter') || 
    q.includes('how to use pos') || 
    q.includes('how to use cash counter') ||
    q.includes('how to use cash register') ||
    q.includes('pos counter') ||
    q.includes('pos guide') ||
    q.includes('cash register guide')
  ) {
    const reply = `🛒 **COMPLETE POS COUNTER & CASH REGISTER OPERATING MANUAL:**\n\n` +
      `The Mart Pro Cash Counter POS is designed for ultra-fast, zero-delay billing and cashier operations:\n\n` +
      `1. 📦 **Scanning & Adding Products to Cart:**\n` +
      `   • **Hardware Barcode Scanner:** Point any USB/wireless barcode scanner at products. Full barcode numbers are auto-recorded & matched instantly.\n` +
      `   • **📷 Camera Barcode Scanner:** Click **"Open Camera Scanner"** to scan using your laptop, phone, or tablet camera.\n` +
      `   • **🔢 4-Digit Product Shortcuts:** Type a product's 4-digit code (e.g. \`1001\` or \`#1001\`) into the barcode box & press \`ENTER\`.\n` +
      `   • **⚡ Quick Shortcuts Tray:** Click any product card in the top shortcuts bar to add it directly to cart.\n\n` +
      `2. ⚖️ **Weighted Products & Scale Items (Per Kg / Liters):**\n` +
      `   • When adding loose goods (fruits, vegetables, meat, oil), the **Weight Prompt Calculator** automatically opens.\n` +
      `   • Enter the weight in kg (e.g. \`1.25\` kg) or volume (liters) — the system computes the exact price automatically.\n\n` +
      `3. 📋 **Cart Table & Quantity Editing:**\n` +
      `   • As items are added, a **Bordered POS Table** is dynamically generated with explicit columns:\n` +
      `     - **Barcode / Code** | **Product Name** | **QTY** | **Unit Price** | **Total Price** | **Discount** | **Action**\n` +
      `   • Edit quantity using \`-\` / \`+\` buttons, click to type numbers directly, or press \`ENTER\` to jump to the next scan.\n\n` +
      `4. ⏸️ **Park / Hold Bills (\`H + D\` / \`A + S\`):**\n` +
      `   • **Hold Active Cart (\`H + D\`):** If a customer forgets an item, press \`H + D\` to park their bill in memory and serve the next person.\n` +
      `   • **Resume Held Bill (\`A + S\`):** Press \`A + S\` to open the Held Bills Queue and restore any parked customer cart instantly.\n\n` +
      `5. 💳 **Payment Settlement & Change Calculator:**\n` +
      `   • Press \`Shift + P\` to open the **Payment Summary**.\n` +
      `   • **Cash Payment:** Enter cash tendered (or click quick cash bills like Rs. 500, 1000, 5000). System calculates change due with live audio voice announcement & Customer Change Modal.\n` +
      `   • **Digital Payments:** Select EasyPaisa, JazzCash, Card, or Raast QR Code to record digital reference transactions.\n\n` +
      `6. 🖨️ **Thermal Receipt Printing & E-Receipts:**\n` +
      `   • Press \`P\` or \`Ctrl + P\` to print 80mm or 58mm thermal receipts with store logo, address, itemized breakdown, discounts, and customer QR code e-receipt links!\n\n` +
      `7. 🔄 **Product Returns & Refund Vouchers (\`R + N\`):**\n` +
      `   • Press \`R + N\` to process customer returns. It auto-restocks inventory, updates revenue, and prints refund slips.`;

    return {
      reply,
      speechText: `At the POS counter, scan barcodes or type 4-digit codes. Use H D to hold bills, Shift P for payment, and P to print thermal receipts.`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // Admin Dashboard Features & Details Guide
  if (
    q.includes('admin dashboard feature') || 
    (q.includes('feature') && (q.includes('admin') || q.includes('dashboard'))) || 
    q.includes('admin feature') || 
    q.includes('dashboard feature') || 
    q.includes('what feature') || 
    q.includes('admin detail') || 
    q.includes('dashboard detail')
  ) {
    const reply = `🏢 **STORE ADMIN DASHBOARD — FEATURES & MODULES DETAIL:**\n\n` +
      `The Store Admin Dashboard is your central control tower for managing store operations, inventory, finances, and staff:\n\n` +
      `1. 📊 **Real-Time Executive Financial Analytics:**\n` +
      `   • **KPI Metric Cards:** Live view of Today's Revenue, Gross Profit, Total Invoices, and Inventory Value at Wholesale Cost vs Retail Price.\n` +
      `   • **7-Day Revenue Trend Chart:** Visual line chart tracking day-by-day store income growth.\n` +
      `   • **24-Hour Hourly Sales Chart:** Bar chart showing peak sales hours throughout the day.\n` +
      `   • **Sales Audit Log:** Filter transactions by date (Today, Yesterday, Custom Range), inspect itemized receipts, and audit cashier billing sessions.\n\n` +
      `2. 📦 **Product Register & Catalog Management:**\n` +
      `   • **Single Item Register:** Add products with barcode, 4-digit shortcut code, category, price, wholesale cost, stock, unit type (piece/kg/liter), and image.\n` +
      `   • **Batch Multi-Product Register:** Fast spreadsheet grid to add 10–50 products at once with auto 4-digit code generation.\n` +
      `   • **Excel / CSV Bulk Import:** Upload supplier spreadsheets with intelligent auto-column mapping.\n` +
      `   • **Low Stock & Reorder Alerts:** Real-time alert list for items dropping below minimum stock levels.\n\n` +
      `3. 🏷️ **Discounts & Promotional Engine:**\n` +
      `   • Apply Percentage (% OFF) or Flat Cash (Rs. OFF) discounts storewide or on selected items.\n` +
      `   • Set promotional expiration timers (1 day, 1 week, end of month).\n` +
      `   • Displays original price, promotional discount, and customer savings on thermal receipts.\n\n` +
      `4. 💰 **Expense Tracking & Net Operating Profit Ledger:**\n` +
      `   • Record store overheads (rent, electricity, staff salaries, maintenance, transport).\n` +
      `   • Automatically subtracts expenses from Gross Profit to compute true Net Operating Profit.\n\n` +
      `5. 🚚 **Supplier Management & Purchase Restocking:**\n` +
      `   • Maintain supplier contact ledgers and purchase orders.\n` +
      `   • Track order statuses (Pending, Ordered, Delivered) and automatically restock inventory upon delivery.\n\n` +
      `6. 👥 **Cashier Staff Management & Session Auditing:**\n` +
      `   • Track cashier login/logout sessions, active counter numbers, invoices created, and revenue per staff member.\n` +
      `   • Manage base salaries, bonuses, and commission records.\n\n` +
      `7. ⚙️ **Store Customization & Thermal Printer Setup:**\n` +
      `   • Customize store branding, logo, tax registration number, thermal receipt format (Standard, Classic, Eco), header/footer notes, and audio voice toggles.`;

    return {
      reply,
      speechText: `The Admin Dashboard provides real-time sales analytics, inventory management, batch product registration, discount engine, expense tracking, supplier restocking, cashier auditing, and receipt settings.`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // How to Use Admin Dashboard Guide
  if (
    q.includes('how to use admin') || 
    q.includes('how to use dashboard') || 
    q.includes('admin guide') || 
    q.includes('dashboard guide') || 
    q.includes('admin dashboard') || 
    q.includes('use admin')
  ) {
    const reply = `⚙️ **HOW TO USE THE STORE ADMIN DASHBOARD — STEP-BY-STEP OPERATING GUIDE:**\n\n` +
      `Here is how to navigate and manage your store using the Admin Dashboard:\n\n` +
      `1. 🧭 **Navigating the Main Sidebar Menu:**\n` +
      `   • **Dashboard / Overview:** View live revenue KPI cards, gross profit, sales volume charts, and low stock warnings.\n` +
      `   • **Sales Audit Log:** Inspect past receipts, filter by date, and track total sales revenue.\n` +
      `   • **Product Register:** Manage your product catalog, prices, wholesale costs, and stock levels.\n` +
      `   • **Discounts & Promotions:** Create promotional sales (% OFF or Rs. OFF) with expiration dates.\n` +
      `   • **Expenses Ledger:** Log store operating costs (rent, salaries, electricity) for net profit calculation.\n` +
      `   • **Supplier Orders:** Manage wholesale suppliers and place purchase restocking orders.\n` +
      `   • **Staff Tracker:** Audit cashier login sessions, active counters, and individual staff sales.\n` +
      `   • **Store Settings:** Configure receipt templates, store logo, address, and hardware permissions.\n\n` +
      `2. 📦 **How to Add Products to Inventory:**\n` +
      `   • Click **"Product Register"** in the sidebar.\n` +
      `   • Choose **"Single Register"** for individual items, **"Batch Register"** for multi-item spreadsheet entry, or **"Excel Import"** to upload files.\n` +
      `   • Enter name, retail price, cost price, stock, and barcode. The system auto-generates a unique **4-digit shortcut code** (e.g. \`#1001\`).\n\n` +
      `3. 🏷️ **How to Set Discounts for Customers:**\n` +
      `   • Click **"Discounts & Promotions"** -> Choose **"All Products"** or select specific items.\n` +
      `   • Select discount type (% OFF or Rs. OFF), enter value, set expiration date, and click **"Apply Discount"**.\n\n` +
      `4. 💰 **How to Record Operating Expenses:**\n` +
      `   • Click **"Expenses Ledger"** -> Click **"Add Expense"** -> Enter category (Rent, Utilities, Salary), amount, and date. Net Profit will update automatically.\n\n` +
      `5. 🖨️ **How to Customize Thermal Receipts:**\n` +
      `   • Click **"Store Settings"** -> Scroll to **"Receipt Settings"** -> Select layout (Standard 80mm, Classic 58mm, or Eco), update store header/footer text, and upload your store logo.`;

    return {
      reply,
      speechText: `Navigate the sidebar to manage Sales, Product Register, Discounts, Expenses, Suppliers, Staff, and Store Settings. Ask me if you need help with any specific action!`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // General Software / System Guide
  if (
    q.includes('guide') || 
    q.includes('how to use') || 
    q.includes('help') || 
    q.includes('manual') || 
    q.includes('tutorial') || 
    q.includes('how system works') || 
    q.includes('guide me') ||
    q.includes('software guide') ||
    q.includes('system guide')
  ) {
    const reply = `📖 **MART PRO SUPERMARKET MANAGEMENT SYSTEM — COMPLETE GUIDE:**\n\n` +
      `Welcome! Mart Pro is your complete solution for supermarket checkout and administration. Here are the core areas:\n\n` +
      `🛒 **1. Cash Counter POS & Billing:**\n` +
      `   • Fast barcode scanning, 4-digit code typing (\`#1001\`), per-kg weight scale calculation, parking bills (\`H+D\` / \`A+S\`), and thermal receipt printing (\`P\`).\n\n` +
      `🏢 **2. Store Admin Dashboard:**\n` +
      `   • Real-time financial revenue metrics, gross profit, stock valuations, 7-day sales charts, and transaction inspection.\n\n` +
      `📦 **3. Product Register & Stock Management:**\n` +
      `   • Register products via Single Form, Batch Multi-Product Grid, or Excel/CSV spreadsheet upload.\n\n` +
      `🏷️ **4. Discounts & Promotions Engine:**\n` +
      `   • Create storewide or item-level promotional discounts with automatic customer savings display on receipts.\n\n` +
      `💰 **5. Expenses & Net Profit Ledger:**\n` +
      `   • Record store operating overheads to compute true Net Operating Profit.\n\n` +
      `🚚 **6. Supplier Management & Restocking:**\n` +
      `   • Place supplier purchase orders and auto-restock inventory upon delivery.\n\n` +
      `💡 *Tip: Click any quick suggestion chip above or ask me a specific question for instant step-by-step guidance!*`;

    return {
      reply,
      speechText: `Mart Pro includes POS billing, Admin analytics, product registration, discount management, expense tracking, and supplier restocking. Ask me any question for step by step guidance!`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // Keyboard shortcuts guide
  if (q.includes('shortcut') || q.includes('short cut') || q.includes('key combination') || q.includes('hotkey') || q.includes('keys')) {
    const reply = `⌨️ **Mart Pro POS Keyboard Shortcuts Guide:**\n\n` +
      `• \`H + D\` (or rapid HD) — **Hold Current Bill** (Parks active cart in memory)\n` +
      `• \`A + S\` (or rapid AS) — **Retrieve Held Bills** (Resumes parked customer cart)\n` +
      `• \`S + K\` (or rapid SK) — **4-Digit Product Shortcuts Directory**\n` +
      `• \`R + N\` (or rapid RN) — **Return & Refund Voucher** (Restocks inventory)\n` +
      `• \`Shift + P\` — **Quick Payment & Bill Settlement**\n` +
      `• \`P\` or \`Ctrl + P\` — **Instant Thermal Receipt Print**\n` +
      `• \`Escape (ESC)\` — **Close Modal / Back to Dashboard**\n\n` +
      `💡 *Tip: Every product also has a unique 4-digit code (e.g. #1001) that cashiers can type into the barcode box for ultra-fast checkout!*`;

    return {
      reply,
      speechText: `Mart Pro has fast keyboard shortcuts like H D to hold bills, A S to retrieve held bills, S K for product shortcuts, and R N for returns.`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // Hold / Park bill guide
  if (q.includes('hold bill') || q.includes('park bill') || q.includes('held bill') || q.includes('resume bill') || q.includes('park cart')) {
    const reply = `🛒 **How to Park & Resume Bills at Cash Counter:**\n\n` +
      `1. **Park Current Bill:** While items are in the cart, press \`H + D\` on keyboard or click the **"Hold Bill"** button.\n` +
      `2. **Ring Up Next Customer:** The cart clears immediately so you can serve the next person without waiting.\n` +
      `3. **Retrieve Parked Sale:** Press \`A + S\` or click **"Held Bills"** button at the top bar. Click on the customer's parked cart to restore all items with original quantities and prices!`;

    return {
      reply,
      speechText: `To hold a bill, press H D or click Hold Bill. To retrieve it later, press A S or click Held Bills.`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // Returns & Refunds guide
  if (q.includes('return') || q.includes('refund') || q.includes('wapsi') || q.includes('exchange')) {
    const reply = `🔄 **How to Process Product Returns & Refunds:**\n\n` +
      `1. At the Cash Counter, press \`R + N\` or click the **"Product Return"** button.\n` +
      `2. Look up the customer's receipt number or select the returned item from the list.\n` +
      `3. Enter the returned quantity and reason for return.\n` +
      `4. Click **"Process Refund & Print Voucher"**.\n` +
      `5. **Automatic Synchronization:** Stock is immediately added back into inventory, and refund is recorded in the store audit ledger!`;

    return {
      reply,
      speechText: `To process a return, press R N or click Product Return at the cash counter, specify the items, and print a verified refund voucher.`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // Discounts guide
  if (q.includes('discount') || q.includes('promotion') || q.includes('offer') || q.includes('sale price')) {
    const reply = `🏷️ **How to Set Discounts & Promotions:**\n\n` +
      `1. Go to **Store Admin Dashboard** -> Click **"Discounts & Promotions"**.\n` +
      `2. Choose target: **Storewide (All Products)** or **Selected Products**.\n` +
      `3. Choose discount format: **Percentage (% OFF)** or **Fixed Cash Amount (Rs. OFF)**.\n` +
      `4. Set validity dates (e.g. 3 days, 1 week, end of month).\n` +
      `5. Click **"Apply Discount"**.\n\n` +
      `🧾 **Receipt Output:** The receipt will clearly show regular price, discounted price, Gross Subtotal, Discount amount (or Rs. 0.00 if none), Total Discount, and Grand Total!`;

    return {
      reply,
      speechText: `You can set percentage or flat cash discounts from the Discounts Manager in Store Admin. Receipts will automatically display original price, discount amount, and total savings.`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // Sell by weight guide
  if (q.includes('weight') || q.includes('per kg') || q.includes('liquid') || q.includes('per liter') || q.includes('scale') || q.includes('wazan')) {
    const reply = `⚖️ **How to Sell Products by Weight (Kg / Liters):**\n\n` +
      `1. **Registration:** When adding a product, set **Sell By** to *"Weight (per kg/liter)"* and unit to *kg* or *liter*.\n` +
      `2. **At Cash Counter:** When cashiers scan or click the item, the **Weight Prompt Dialog** automatically pops up.\n` +
      `3. **Input Weight:** Type the exact weight (e.g. \`1.45\` kg) or connect a digital weighing scale.\n` +
      `4. The system calculates exact price: \`Weight × Price per Kg\` and prints it accurately on the receipt!`;

    return {
      reply,
      speechText: `For weight items, register them with Sell by Weight. Scanning them at checkout pops up the weight prompt to enter kilograms.`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // Thermal printing guide
  if (q.includes('receipt') || q.includes('thermal print') || q.includes('printer') || q.includes('print slip')) {
    const reply = `🖨️ **Receipt Printing & Thermal Slip Configuration:**\n\n` +
      `• **Standard Thermal Print:** Press \`P\` or \`Ctrl + P\` or click **"Print Receipt"** on the checkout modal.\n` +
      `• **Paper Sizes:** Supports both **80mm** (standard wide POS) and **58mm** (compact mobile) thermal printers.\n` +
      `• **Receipt Formats:** In Store Settings, choose between *Standard*, *Classic Detailed*, or *Compact Eco*.\n` +
      `• **Digital Pass & E-Receipt:** Every printed receipt includes a live QR code so customers can view and save their e-receipt on mobile devices (valid online for 7 days; store accounting records are permanent).`;

    return {
      reply,
      speechText: `Press P to print thermal receipts. The software supports 80 millimeter and 58 millimeter thermal printers and QR code e receipts.`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // Excel / CSV bulk import guide
  if (q.includes('excel') || q.includes('csv') || q.includes('import') || q.includes('bulk upload') || q.includes('spreadsheet')) {
    const reply = `📊 **How to Bulk Import Products via Excel / CSV:**\n\n` +
      `1. Go to **Store Admin** -> **"Product Register"** -> click **"Excel / CSV Import"**.\n` +
      `2. Upload your spreadsheet (supports \`.xlsx\`, \`.xls\`, \`.csv\`).\n` +
      `3. The AI engine auto-detects column names (Name, Barcode, Retail Price, Cost Price, Stock, Category, Unit).\n` +
      `4. Review the preview table, edit any values, and click **"Import All Products"**.\n` +
      `5. You can also upload spreadsheets directly into this AI Copilot chat!`;

    return {
      reply,
      speechText: `To import products, go to Product Register and click Excel Import, or attach your spreadsheet directly into this AI chat.`,
      matchedProducts: [],
      highlightedProduct: null,
      intent: 'guide'
    };
  }

  // 1. TOP SELLING QUERY (e.g. "Top selling oil", "most selling ghee", "best seller biscuit")
  if (
    q.includes('top selling') || 
    q.includes('most selling') || 
    q.includes('best seller') || 
    q.includes('highest selling') ||
    q.includes('popular')
  ) {
    // Filter candidate products
    let candidates = products;
    if (targetCategory) {
      candidates = products.filter(p => {
        const pName = clean(p.name);
        const pCat = clean(p.category || '');
        return pName.includes(targetCategory) || pCat.includes(targetCategory);
      });
    }

    if (candidates.length === 0 && targetCategory) {
      return {
        reply: `🔍 We currently do not have any items registered under "${targetCategory}" in our catalog.`,
        speechText: `We do not have any items registered under ${targetCategory} right now.`,
        matchedProducts: [],
        highlightedProduct: null,
        intent: 'top_selling',
        categoryTag: targetCategory
      };
    }

    // Compute sales volume per candidate
    const salesMap = new Map<string, { product: Product; unitsSold: number; totalRevenue: number }>();
    candidates.forEach(p => {
      salesMap.set(p.id, { product: p, unitsSold: 0, totalRevenue: 0 });
    });

    sales.forEach(s => {
      (s.items || []).forEach(item => {
        const found = salesMap.get(item.productId);
        if (found) {
          found.unitsSold += item.quantity || 1;
          found.totalRevenue += item.total || (item.price * (item.quantity || 1));
        }
      });
    });

    // Sort by units sold descending
    const ranked = Array.from(salesMap.values()).sort((a, b) => b.unitsSold - a.unitsSold);

    if (ranked.length > 0 && ranked[0].unitsSold > 0) {
      const top = ranked[0];
      const topProd = top.product;
      const unitLabel = topProd.sellBy === 'weight' ? (topProd.unitType || 'kg') : 'units';
      
      const reply = `🔥 **Top Selling ${targetCategory ? targetCategory.toUpperCase() : 'Product'}:**\n• **Item:** ${topProd.name}\n• **Retail Price:** Rs. ${topProd.price.toFixed(2)}${topProd.sellBy === 'weight' ? ` per ${topProd.unitType || 'kg'}` : ''}\n• **Sales Record:** ${top.unitsSold.toLocaleString()} ${unitLabel} sold\n• **Stock Status:** ${topProd.stockQuantity > 0 ? `In Stock (${topProd.stockQuantity} remaining)` : 'Out of Stock'}`;
      const speech = `Our top selling ${targetCategory || 'item'} is ${topProd.name}, priced at ${Math.round(topProd.price)} rupees. Over ${top.unitsSold} ${unitLabel} have been sold!`;

      return {
        reply,
        speechText: speech,
        matchedProducts: ranked.slice(0, 3).map(r => r.product),
        highlightedProduct: topProd,
        intent: 'top_selling',
        categoryTag: targetCategory || topProd.category
      };
    }

    // If no sales recorded yet, provide the first/most stocked product in that category
    const featured = candidates[0];
    if (featured) {
      const reply = `🌟 **Featured ${targetCategory ? targetCategory.toUpperCase() : 'Item'}:**\n• **Item:** ${featured.name}\n• **Retail Price:** Rs. ${featured.price.toFixed(2)}\n• **Stock:** ${featured.stockQuantity} available\n*(No transactions recorded yet in sales history, showing top catalog item)*`;
      const speech = `Our featured ${targetCategory || 'item'} is ${featured.name}, priced at ${Math.round(featured.price)} rupees.`;

      return {
        reply,
        speechText: speech,
        matchedProducts: candidates.slice(0, 3),
        highlightedProduct: featured,
        intent: 'top_selling',
        categoryTag: targetCategory || featured.category
      };
    }
  }

  // 2. CHEAPEST QUERY (e.g. "cheapest oil", "cheapest ghee", "cheapest biscuit", "cheapest soap")
  if (
    q.includes('cheap') || 
    q.includes('lowest price') || 
    q.includes('least price') || 
    q.includes('budget') ||
    q.includes('minimum price') ||
    q.includes('sasta') ||
    q.includes('sasti')
  ) {
    let candidates = products;
    if (targetCategory) {
      candidates = products.filter(p => {
        const pName = clean(p.name);
        const pCat = clean(p.category || '');
        return pName.includes(targetCategory) || pCat.includes(targetCategory);
      });
    }

    if (candidates.length === 0) {
      return {
        reply: `🔍 We couldn't find any items matching "${targetCategory || rawQuery}". Please check with store staff or register this category.`,
        speechText: `We could not find any ${targetCategory || 'items'} matching that description in store catalog.`,
        matchedProducts: [],
        highlightedProduct: null,
        intent: 'cheapest',
        categoryTag: targetCategory || undefined
      };
    }

    // Sort ascending by price
    const sorted = [...candidates].sort((a, b) => (a.price || 0) - (b.price || 0));
    const cheapest = sorted[0];

    const altOptions = sorted.slice(1, 4);
    let altText = '';
    if (altOptions.length > 0) {
      altText = `\n\n**Other budget options:**\n` + altOptions.map(p => `• ${p.name} — Rs. ${p.price.toFixed(2)}`).join('\n');
    }

    const reply = `💰 **Cheapest ${targetCategory ? targetCategory.toUpperCase() : 'Item'}:**\n• **Product:** ${cheapest.name}\n• **Retail Price:** Rs. ${cheapest.price.toFixed(2)}${cheapest.sellBy === 'weight' ? ` per ${cheapest.unitType || 'kg'}` : ''}\n• **Category:** ${cheapest.category || 'General'}\n• **Stock Status:** ${cheapest.stockQuantity > 0 ? `In Stock (${cheapest.stockQuantity} units)` : 'Out of Stock'}${altText}`;
    const speech = `The cheapest ${targetCategory || 'item'} is ${cheapest.name} at only ${Math.round(cheapest.price)} rupees. It is currently in stock.`;

    return {
      reply,
      speechText: speech,
      matchedProducts: sorted.slice(0, 4),
      highlightedProduct: cheapest,
      intent: 'cheapest',
      categoryTag: targetCategory || cheapest.category
    };
  }

  // 3. SPECIFIC PRODUCT PRICE QUERY (e.g. "Price of zeera biscuit", "Price if zeera biscuit", "Rate of Dalda")
  const isPriceQuery = 
    q.includes('price') || 
    q.includes('rate') || 
    q.includes('cost') || 
    q.includes('how much') ||
    q.includes('kitna') ||
    q.includes('kitne ka');

  if (isPriceQuery || targetCategory) {
    // Score all products against the query
    const scored = products.map(p => ({
      product: p,
      score: calculateMatchScore(q, p)
    })).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const match = scored[0].product;
      const otherMatches = scored.slice(1, 4).map(s => s.product);

      const reply = `🏷️ **Price Check for "${match.name}":**\n• **Retail Price:** Rs. ${match.price.toFixed(2)}${match.sellBy === 'weight' ? ` per ${match.unitType || 'kg'}` : ''}\n• **Barcode:** \`${match.barcode || 'N/A'}\`\n• **Category:** ${match.category || 'General'}\n• **Stock Availability:** ${match.stockQuantity > 0 ? `✅ In Stock (${match.stockQuantity} available)` : '❌ Currently Out of Stock'}`;
      const speech = `${match.name} is priced at ${Math.round(match.price)} rupees ${match.sellBy === 'weight' ? `per ${match.unitType || 'kilogram'}` : ''}. ${match.stockQuantity > 0 ? 'It is in stock.' : 'It is currently out of stock.'}`;

      return {
        reply,
        speechText: speech,
        matchedProducts: [match, ...otherMatches],
        highlightedProduct: match,
        intent: 'price_check',
        categoryTag: match.category
      };
    }
  }

  // 4. STOCK CHECK QUERY (e.g. "do you have milk?", "is rice in stock?")
  if (q.includes('stock') || q.includes('available') || q.includes('have') || q.includes('hai kya')) {
    const scored = products.map(p => ({
      product: p,
      score: calculateMatchScore(q, p)
    })).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const match = scored[0].product;
      const inStock = match.stockQuantity > 0;
      const reply = `📦 **Stock Verification: "${match.name}"**\n• **Status:** ${inStock ? `✅ In Stock (${match.stockQuantity} remaining)` : '❌ Out of Stock'}\n• **Price:** Rs. ${match.price.toFixed(2)}\n• **Barcode:** \`${match.barcode || 'N/A'}\``;
      const speech = inStock 
        ? `Yes! We have ${match.name} in stock with ${match.stockQuantity} units available at ${Math.round(match.price)} rupees.`
        : `Sorry, ${match.name} is currently out of stock.`;

      return {
        reply,
        speechText: speech,
        matchedProducts: [match],
        highlightedProduct: match,
        intent: 'stock_check'
      };
    }
  }

  // 5. GENERAL QUERY OR FALLBACK
  // Try to search if any product name matches partially
  const fallbackMatches = products.filter(p => {
    const pName = clean(p.name);
    return q.split(' ').some(t => t.length > 2 && pName.includes(t));
  });

  if (fallbackMatches.length > 0) {
    const top = fallbackMatches[0];
    return {
      reply: `🔍 Here is what I found for "${rawQuery}":\n• **Product:** ${top.name}\n• **Price:** Rs. ${top.price.toFixed(2)}\n• **Stock:** ${top.stockQuantity} in stock`,
      speechText: `I found ${top.name} priced at ${Math.round(top.price)} rupees.`,
      matchedProducts: fallbackMatches.slice(0, 3),
      highlightedProduct: top,
      intent: 'general'
    };
  }

  return {
    reply: `🤖 I understand you are asking: "${rawQuery}".\n\nTry asking questions like:\n• 🧴 *"Cheapest oil"* or *"Cheapest ghee"*\n• 🔥 *"Top selling oil"* or *"Top selling biscuit"*\n• 🍪 *"Price of zeera biscuit"*\n• ☕ *"Cheapest tea"*\n• 🧺 *"Cheapest detergent"* or *"Cheapest soap"*`,
    speechText: `You can ask me for the cheapest oil, cheapest ghee, top selling items, or the price of any product like zeera biscuit.`,
    matchedProducts: [],
    highlightedProduct: null,
    intent: 'general'
  };
}
