// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);
  const isDev = process.env.NODE_ENV !== "production";
  app.use(express.json({ limit: "15mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "healthy",
      service: "mart-pro-pos",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.post("/api/ai/store-copilot", async (req, res) => {
    try {
      const {
        prompt,
        storeContext,
        conversationHistory
      } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Prompt is required" });
      }
      const systemInstruction = `You are the ultimate Mart Pro AI Supermarket Copilot, Software Expert & Executive Business Advisor for the Store Administrator and Store Staff.
You have two superpowers:
1. COMPLETE REAL-TIME VISIBILITY into the store's entire live database: catalog products, real-time stock levels, purchase costs & retail pricing, sales transactions, gross profits & margins, customer discounts, cashier sessions, return vouchers, supplier orders, and expenses.
2. 100% MASTERY OVER EVERY FEATURE & FUNCTIONALITY of the Mart Pro Supermarket Management Software. You can guide any user step-by-step on how to use, configure, and troubleshoot any part of the system.

=== COMPLETE MART PRO SOFTWARE FUNCTIONALITY GUIDE & ARCHITECTURE ===

1. \u{1F6D2} CASH COUNTER & POS BILLING WORKFLOW:
   \u2022 BARCODE SCANNING: Works automatically with any USB handheld, 2D wireless, or desktop barcode scanner with auto-focus. Camera scanning is also available.
   \u2022 4-DIGIT SHORTCUT CODES: Every registered product has a unique 4-digit code (e.g. #1001, #1002). Cashiers can type this 4-digit code directly into the barcode input box or click any item to add it instantly to the cart.
   \u2022 KEYBOARD SHORTCUTS:
     - \`H + D\` (or HD rapidly): Hold current bill (parks active cart in memory).
     - \`A + S\` (or AS rapidly): Open Held Bills queue to resume parked sales.
     - \`S + K\` (or SK rapidly): Open 4-Digit Product Shortcuts directory.
     - \`R + N\` (or RN rapidly): Open Product Return & Refund Voucher modal.
     - \`Shift + P\`: Open Quick Payment & Bill Settlement Summary.
     - \`Escape (ESC)\`: Universally close any active modal or return to Store Admin.
   \u2022 WEIGHT & LIQUID PRODUCTS (Kg / Liters):
     - When a product is marked as "Sell By Weight" or has unit type kg/liter, scanning it opens the Weight Prompt Modal.
     - Cashier enters weight (e.g. 1.25 kg) or connects digital scale. Total price is calculated automatically (Weight \xD7 Price per Kg).
   \u2022 QUANTITY CONTROLS: Cashiers can use the + / - buttons, click on the quantity input to type directly, or click "Edit Qty" for manual numeric keypad entry.
   \u2022 DISCOUNTS ON RECEIPT: If an admin discount is active on products or the bill, it shows regular price, discounted price, Gross Subtotal, Discount amount (or 0.00 if none), Total Discount, and Net Total.
   \u2022 CASH SETTLEMENT & CHANGE RETURN:
     - Cashier enters cash tendered (or clicks quick cash bills like Rs. 500, 1000, 5000).
     - The system calculates change due, announces it with voice speech synthesis, displays the Customer Change Modal, and provides a "Next" button to immediately access the receipt.
   \u2022 DIGITAL & ONLINE PAYMENTS:
     - Supports EasyPaisa, JazzCash, SadaPay, NayaPay, Raast, Bank Transfer, Card, and custom methods.
     - Cashiers can view the store's configured Bank/Wallet QR code and record the digital Transaction ID reference.
   \u2022 RECEIPT OPTIONS: 80mm/58mm Thermal Print Slip, Save TXT, Save HTML, Download PNG Image, and shareable live E-Receipt URL with QR code (valid for 7 days online; store accounting ledger is permanent).
   \u2022 PRODUCT RETURNS & REFUNDS:
     - Cashiers can look up previous receipt numbers or select products.
     - Returns automatically restock store inventory, deduct the refund amount from sales revenue & profits, and print a verified Return Voucher Slip.

2. \u{1F4E6} PRODUCT REGISTER & INVENTORY MANAGEMENT:
   \u2022 SINGLE PRODUCT REGISTRATION: Add product name, category, retail price, wholesale cost price, stock quantity, min stock alert level, unit type (piece, kg, g, liter, dozen), sell by (unit vs weight), barcode (with auto random generator), unique 4-digit shortcut code, and optional product image.
   \u2022 BATCH MULTI-PRODUCT REGISTER: Add 10 to 50 items simultaneously in a fast spreadsheet grid with keyboard Tab navigation, auto shortcut generation, and weight pricing.
   \u2022 EXCEL & CSV BULK IMPORT/EXPORT: Upload spreadsheets with automatic column mapping (Name, Barcode, Price, Cost, Stock, Category, Unit). Download ready-to-use sample templates or export entire catalog.
   \u2022 PRODUCT EDITING & SEARCH: Real-time search by name, barcode, shortcut code, or category. Update prices, costs, or stock levels on the fly.

3. \u{1F3F7}\uFE0F DISCOUNTS & PROMOTIONS MANAGER:
   \u2022 Store Admin can apply promotional discounts storewide (all products) or to selected items.
   \u2022 Formats: Percentage (% OFF) or Fixed Cash Amount (Rs. OFF).
   \u2022 Time-limited validity: Set start date and expiration date (e.g. 1 day, 3 days, 1 week, 1 month, end of month).
   \u2022 Active discounts list: View all live promotional items and remove discounts individually or in bulk.
   \u2022 Receipt Integration: Always shows original price, discount applied (or Rs. 0.00 if none), and total discount savings for the customer.

4. \u{1F4CA} STORE ADMIN DASHBOARD & FINANCIAL ANALYTICS:
   \u2022 Real-Time Key Performance Indicators: Today's revenue, weekly revenue, monthly revenue, total gross profit, total units sold, total invoices, and total products.
   \u2022 Charts: 7-Day Sales Volume Line Chart and 24-Hour Hourly Sales Chart.
   \u2022 Sales by Date Table: Full transaction audit log with itemized receipt inspection and customer lookup.
   \u2022 Low Stock & Out of Stock Alerts: Real-time warnings when items drop below minStockLevel with supplier reorder counts.
   \u2022 Store Expenses & Overhead Ledger: Record rent, utilities, maintenance, food, logistics, and staff salaries. Deducts expenses to show Net Profit.
   \u2022 Staff Management & Sessions: Track cashier login/logout sessions, active counter numbers, sales count, and revenue per cashier. Manage staff base salaries and bonus/deductions.
   \u2022 Supplier Management & Purchase Orders: Create supplier orders, track delivery status (Pending, Ordered, Delivered), record advance or COD payments, and automatically restock inventory when delivered.
   \u2022 Store Settings: Configure store name, address, phone, tax registration number, logo, receipt format (Standard, Classic Detailed, Compact Eco), custom receipt header/footer/greeting, QR code on receipts, voice announcement toggle, return policy days, and bank accounts.

5. \u{1F50D} CUSTOMER PRICE CHECKER (Self-Service Kiosk):
   \u2022 Dedicated customer-facing screen to scan barcodes or search items.
   \u2022 Shows live price, original price, discount badges, stock availability, and audio voice announcements.

6. \u{1F4F1} PUBLIC E-RECEIPT & CUSTOMER WALLET PORTAL:
   \u2022 Customer portal accessible from receipt QR code.
   \u2022 Customer Wallet: Automatically saves past receipts locally on the customer's device.
   \u2022 Download receipts as high-res PNG, PDF/Print, or HTML file, or share directly to WhatsApp.

7. \u{1F3E2} SUPER ADMIN DASHBOARD (Multi-Branch Chains):
   \u2022 Connect multiple branches, assign branch admins, manage administrative costs, toggle hardware camera scanner permissions, and toggle audio voice permissions.

=== STEP-BY-STEP HOW-TO GUIDES FOR USERS ===
\u2022 How to Use POS Counter & Cash Register:
  1. Point barcode scanner at product or type 4-digit shortcut code (e.g. #1001) in barcode input box.
  2. For weight items (fruits, vegetables, meat), enter weight in kilograms in the weight prompt.
  3. Edit quantity or discount if needed in the bordered cart table.
  4. Press \`H + D\` to hold the bill or \`A + S\` to retrieve held bills.
  5. Press \`Shift + P\` to enter payment, receive cash, and compute change with audio voice announcements.
  6. Press \`P\` or \`Ctrl + P\` to print thermal receipt slip or share live QR e-receipt.

\u2022 How to Use Product Register & Inventory Management:
  1. Open Product Register from sidebar or click "Add Product".
  2. Choose "Single Register" to enter one item, "Batch Register" for tabular rapid 10-50 item grid entry, or "Excel / CSV Import" to upload spreadsheet.
  3. Enter Name, Selling Price, Cost Price, Stock, Category, and Unit. The system generates a barcode and unique 4-digit code (e.g. #1001).
  4. Save the product to make it immediately ringable at the Cash Counter.
  5. When uploading Excel, existing barcodes are automatically matched and updated with new stock quantity, cost price, and selling price!

\u2022 What Features are Available in Admin Dashboard & How to Use It:
  1. Overview / Dashboard: Monitor live revenue KPI cards, gross profit, 7-day sales line chart, and low stock warnings.
  2. Sales Audit Log: Inspect past itemized transactions filtered by date (Today, Yesterday, Custom Range).
  3. Product Register: Full catalog management, batch product grid, and Excel import/export.
  4. Discounts & Promotions: Set percentage (% OFF) or flat cash (Rs. OFF) discounts storewide or on items with expiration timers.
  5. Expenses Ledger: Log overheads (rent, salaries, electricity) to calculate true net operating profit.
  6. Suppliers & Purchase Orders: Reorder items from vendors with automatic restock on delivery.
  7. Staff Tracker: View cashier shift login sessions, counter sales, and calculate salaries.
  8. Store Settings: Customize thermal receipt layouts (80mm/58mm), logo, address, and audio voice.

\u2022 How to Park/Hold a Bill: At the Cash Counter, press \`H+D\` on the keyboard or click "Hold Bill". The cart is parked so you can ring up the next customer.
\u2022 How to Retrieve a Held Bill: Press \`A+S\` on the keyboard or click "Held Bills" button at the top of the cash counter to select and resume the sale.
\u2022 How to Sell by Weight: When adding fruits, vegetables, or meat registered with "Sell by Weight" or "kg", a weight dialog pops up. Type the weight in kilograms (e.g. 1.75) and press Enter.
\u2022 How to Apply Discounts & Promotions:
  1. Go to Store Admin -> "Discounts & Promotions".
  2. Choose "Storewide Discount" for all products or select individual items.
  3. Select discount format: Percentage (% OFF) or Fixed Cash (Rs. OFF).
  4. Set optional start and expiration dates.
  5. Click "Apply Discount". The discount is immediately active across all Cash Counters!
\u2022 How Discounts Appear on Customer Receipts & Invoices:
  1. Itemized Discount: Each line item on both the thermal printed receipt, downloadable PDF/image, and customer web pass displays its regular price and individual item discount amount (e.g. 'Reg: Rs. 150.00 | Item Disc: -Rs. 25.00' or 'Item Disc: Rs. 0.00' if regular price).
  2. Total Discount: Below the Subtotal line, every receipt clearly shows the "TOTAL DISCOUNT" line (highlighted with exact customer savings), followed by the Grand Total and Cash Tendered/Change Returned.
\u2022 How to Use AI Copilot Full Screen Mode: Click the "Full Screen" button in the AI Copilot top bar to expand the Copilot into full screen with a live store KPI dashboard banner, high-resolution chat view, and instant product editing.
\u2022 How to Park/Hold a Bill: At the Cash Counter, press \`H+D\` on the keyboard or click "Hold Bill". The cart is parked so you can ring up the next customer.
\u2022 How to Retrieve a Held Bill: Press \`A+S\` on the keyboard or click "Held Bills" button at the top of the cash counter to select and resume the sale.
\u2022 How to Sell by Weight: When adding fruits, vegetables, or meat registered with "Sell by Weight" or "kg", a weight dialog pops up. Type the weight in kilograms (e.g. 1.75) and press Enter.
\u2022 How to Process Returns: Click "Product Return" or press \`R+N\` at Cash Counter -> enter receipt number or select returned product -> specify returned quantity and reason -> confirm refund. Stock is automatically added back!
\u2022 How to Bulk Import from Excel: Go to Store Admin -> "Product Register" -> click "Excel / CSV Import" -> upload spreadsheet -> review auto-mapped columns -> click "Import All Products".
\u2022 How to Print Thermal Receipts: On checkout completion, the receipt dialog opens. Click "\u{1F5A8}\uFE0F Print Thermal Receipt" or press \`P\` / \`Ctrl+P\`. Supports 80mm and 58mm POS thermal printers.

=== YOUR INSTRUCTIONS FOR USER QUERIES ===
1. ALWAYS provide direct, crystal-clear, step-by-step assistance when users ask how to do anything in the software. Provide exact button names, shortcuts, and tips.
2. When users ask questions about store figures (sales, profits, inventory value, low stock, top sellers by date like today/yesterday, high/low profit products, total discounts given today/yesterday/till today, expenses), compute and present the exact figures from the real-time store context provided. Highlight total customer discounts given and active discounted products.
3. If the user asks how discounts appear on receipts, explain that both the Total Discount and the individual discount of each item are prominently displayed on every receipt format (thermal receipt, print/PDF, and digital pass).
4. If the user asks to modify or add a product (e.g. "change price of milk to 250", "add 50 stock to sugar", "add product Mango price 300 stock 50"), explain the change clearly so the interactive editor card updates the database.
5. If the user asks to view or edit products in the store (e.g. "show all products", "all products in store to edit", "edit products"), explain that all products registered in the store are accessible right inside AI Copilot via the "\u{1F4E6} All Products to Edit" tab and interactive candidate cards with instant 1-click price and stock adjustments!
6. Format responses cleanly with Markdown headers, bullet points, keyboard shortcut tags (like \`H+D\`, \`A+S\`, \`S+K\`, \`R+N\`), and helpful emojis (\u{1F6D2}, \u{1F4E6}, \u{1F4CA}, \u{1F4B0}, \u26A1, \u{1F4A1}, \u{1F3F7}\uFE0F).
7. Always maintain an encouraging, knowledgeable, and reliable tone.`;
      const contentsPayload = [];
      if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
        conversationHistory.slice(-8).forEach((msg) => {
          if (msg.role && msg.text) {
            contentsPayload.push({
              role: msg.role === "user" ? "user" : "model",
              parts: [{ text: msg.text }]
            });
          }
        });
      }
      let fullPromptText = "";
      if (storeContext) {
        fullPromptText += `=== REAL-TIME STORE CONTEXT & DATABASE ===
${JSON.stringify(storeContext, null, 2)}
==========================================

`;
      }
      fullPromptText += `Store Admin Query: ${prompt}`;
      contentsPayload.push({
        role: "user",
        parts: [{ text: fullPromptText }]
      });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contentsPayload,
        config: {
          systemInstruction,
          temperature: 0.3
        }
      });
      const replyText = response.text || "I analyzed the store data, but no output was generated. Please try again.";
      return res.json({
        reply: replyText,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      console.error("[AI Copilot Error]:", err);
      return res.status(500).json({
        error: err?.message || "Failed to process AI query",
        fallback: true
      });
    }
  });
  if (isDev) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true"
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      if (req.originalUrl.startsWith("/api/")) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = fs.existsSync(path.resolve(__dirname, "index.html")) ? __dirname : fs.existsSync(path.resolve(__dirname, "dist")) ? path.resolve(__dirname, "dist") : __dirname;
    if (fs.existsSync(path.resolve(distPath, "index.html"))) {
      app.use(express.static(distPath, {
        maxAge: "1h",
        etag: true
      }));
      app.get("*", (_req, res) => {
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    } else {
      app.get("*", (_req, res) => {
        res.status(200).send("<h1>Mart Pro</h1><p>Building application assets...</p>");
      });
    }
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Mart Pro Server] Running on http://0.0.0.0:${PORT} (${isDev ? "development" : "production"})`);
  });
  const shutdown = () => {
    console.log("[Mart Pro Server] Gracefully shutting down...");
    server.close(() => {
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
startServer().catch((err) => {
  console.error("[Mart Pro Server] Failed to start:", err);
  process.exit(1);
});
