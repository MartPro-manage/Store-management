import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  X, 
  Send, 
  Bot, 
  User, 
  FileSpreadsheet, 
  Upload, 
  TrendingUp, 
  Package, 
  ShoppingBag, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle, 
  Scale, 
  Download, 
  RefreshCw,
  Coins,
  DollarSign,
  Edit3,
  Search,
  Tag,
  Boxes,
  ArrowRight,
  ArrowLeft,
  Filter,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Trash2,
  BarChart3,
  Zap,
  Plus,
  Minus,
  SlidersHorizontal,
  Eye
} from 'lucide-react';
import { Product, Sale, ProductReturn, Store, UserAccount } from '../types';
import { BatchProductRow, parseExcelProductFile, generateRandomBarcode } from '../lib/excelParser';
import { db, doc, setDoc, updateDoc, cleanFirestoreData } from '../lib/firebase';
import { AiProductEditorCard, ProductEditDraft } from './AiProductEditorCard';
import { processStoreAiQuery } from '../lib/storeAiEngine';
import { generateNextShortcutCode } from '../utils/productShortcuts';
import { playScanSuccessBeep } from '../lib/sound';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  parsedProducts?: BatchProductRow[];
  productEditDraft?: ProductEditDraft;
  productCandidates?: Product[];
  actionTaken?: boolean;
}

/**
 * Formatted Markdown Text renderer for AI Copilot responses
 */
const FormattedMarkdownText: React.FC<{ text: string; isUser?: boolean }> = ({ text, isUser = false }) => {
  if (!text) return null;

  if (isUser) {
    return <div className="whitespace-pre-wrap font-sans leading-relaxed">{text}</div>;
  }

  const lines = text.split('\n');

  const formatInline = (content: string) => {
    // split by code tags `...`
    const codeParts = content.split(/(`[^`]+`)/g);
    return codeParts.map((cPart, cIdx) => {
      if (cPart.startsWith('`') && cPart.endsWith('`') && cPart.length > 2) {
        const codeVal = cPart.slice(1, -1);
        return (
          <code key={cIdx} className="px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-[11px] sm:text-xs font-bold bg-amber-100/90 text-amber-950 border border-amber-300/80 shadow-2xs inline-block">
            {codeVal}
          </code>
        );
      }

      // split by **bold**
      const boldParts = cPart.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((bPart, bIdx) => {
        if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length > 4) {
          return (
            <strong key={bIdx} className="font-black text-slate-900">
              {bPart.slice(2, -2)}
            </strong>
          );
        }
        if (bPart.startsWith('*') && bPart.endsWith('*') && bPart.length > 2) {
          return (
            <em key={bIdx} className="italic text-slate-600">
              {bPart.slice(1, -1)}
            </em>
          );
        }
        return bPart;
      });
    });
  };

  return (
    <div className="space-y-1.5 font-sans leading-relaxed text-slate-800">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        // Header lines starting with emojis or main title
        const isHeading = (trimmed.startsWith('🛒') || trimmed.startsWith('🏢') || trimmed.startsWith('⚙️') || trimmed.startsWith('📖') || trimmed.startsWith('⌨️') || trimmed.startsWith('👋')) && trimmed.includes('**');
        
        if (isHeading) {
          return (
            <div key={idx} className="my-2 p-2.5 rounded-xl bg-orange-50/90 border border-orange-200/90 text-orange-950 font-black text-xs sm:text-sm shadow-2xs">
              {formatInline(trimmed)}
            </div>
          );
        }

        // List item bullet
        if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
          const bulletText = trimmed.substring(1).trim();
          return (
            <div key={idx} className="flex items-start gap-2 pl-1.5 text-xs sm:text-sm my-0.5">
              <span className="text-orange-600 font-extrabold leading-tight text-sm">•</span>
              <span className="flex-1">{formatInline(bulletText)}</span>
            </div>
          );
        }

        // Numbered item
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-0.5 font-medium text-xs sm:text-sm my-1 text-slate-900">
              <span className="px-2 py-0.5 rounded-md bg-orange-600 text-white font-extrabold text-[10px] shrink-0 shadow-2xs mt-0.5">
                {numMatch[1]}
              </span>
              <span className="flex-1">{formatInline(numMatch[2])}</span>
            </div>
          );
        }

        return (
          <p key={idx} className="text-xs sm:text-sm my-0.5">
            {formatInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
};

interface CandidateProductsListProps {
  products: Product[];
  onSelectProduct: (p: Product) => void;
  currencySymbol?: string;
  title?: string;
  onOpenFullCatalog?: () => void;
}

const CandidateProductsList: React.FC<CandidateProductsListProps> = ({ 
  products, 
  onSelectProduct, 
  currencySymbol = 'Rs.',
  title,
  onOpenFullCatalog
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category.trim());
    });
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return products.filter(p => {
      const matchesCategory = categoryFilter === 'all' || (p.category && p.category.toLowerCase().trim() === categoryFilter.toLowerCase());
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        p.name?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        p.shortcutCode?.toLowerCase().includes(q) ||
        `#${p.shortcutCode}`.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );
    });
  }, [products, searchTerm, categoryFilter]);

  return (
    <div className="mt-3 pt-3 border-t border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
        <div className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
          <Boxes className="w-4 h-4 text-orange-600" />
          <span>{title || `All Products in Store (${filtered.length} of ${products.length})`}</span>
        </div>
        <div className="flex items-center gap-2">
          {onOpenFullCatalog && (
            <button
              type="button"
              onClick={onOpenFullCatalog}
              className="px-2 py-0.5 rounded-md bg-orange-100 hover:bg-orange-200 text-orange-800 text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              <span>Open All Products Table</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
          <span className="text-[10px] text-slate-500 font-medium">Click any product to edit</span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-1.5 mb-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products by name, #1001 shortcut code, barcode, or category..."
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:border-orange-500 focus:bg-white focus:outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ×
            </button>
          )}
        </div>

        {categories.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 text-[11px]">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-2 py-0.5 rounded-md font-bold whitespace-nowrap transition-colors cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-orange-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Categories ({products.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-orange-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto custom-scrollbar pr-1">
        {filtered.length === 0 ? (
          <div className="col-span-full py-6 text-center text-xs text-slate-400">
            No products found matching "{searchTerm}".
          </div>
        ) : (
          filtered.map(p => {
            const isOutOfStock = (p.stockQuantity ?? 0) <= 0;
            const isLowStock = !isOutOfStock && (p.stockQuantity ?? 0) <= (p.minStockLevel || 5);
            const isDiscounted = Boolean(p.discountActive && (p.discountValue || 0) > 0);
            return (
              <div
                key={p.id}
                className="p-2.5 rounded-xl border border-slate-200 bg-white hover:border-orange-300 hover:shadow-xs transition-all flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-bold text-xs text-slate-900 leading-tight line-clamp-1" title={p.name}>
                      {p.name}
                    </span>
                    {p.shortcutCode && (
                      <span className="px-1.5 py-0.5 rounded bg-orange-50 border border-orange-200 font-mono text-[10px] font-extrabold text-orange-800 shrink-0">
                        #{p.shortcutCode}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                    <span className="truncate">{p.category || 'General'}</span>
                    {p.barcode && <span className="font-mono text-[10px] text-slate-400 truncate">[{p.barcode}]</span>}
                    {isDiscounted && (
                      <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[9px]">
                        🏷️ {p.discountValue}% OFF
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                  <div>
                    <div className="font-extrabold text-slate-900">
                      {currencySymbol} {(p.price || 0).toFixed(2)}
                      {p.sellBy === 'weight' ? `/${p.unitType || 'kg'}` : ''}
                    </div>
                    <div className={`text-[10px] font-bold ${
                      isOutOfStock ? 'text-red-600' : isLowStock ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {isOutOfStock ? 'Out of stock' : isLowStock ? `Low: ${p.stockQuantity} left` : `${p.stockQuantity} in stock`}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectProduct(p)}
                    className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

interface StoreAiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store;
  products?: Product[];
  sales?: Sale[];
  returns?: ProductReturn[];
  currentUser?: UserAccount;
  onOpenBatchRegister?: () => void;
  initialProductToEdit?: Product | null;
  onProductUpdated?: (updated: Product) => void;
  initialSpreadsheetProducts?: BatchProductRow[] | null;
}

const DEFAULT_PRODUCTS: Product[] = [];
const DEFAULT_SALES: Sale[] = [];
const DEFAULT_RETURNS: ProductReturn[] = [];

export const StoreAiAssistantModal: React.FC<StoreAiAssistantModalProps> = ({
  isOpen,
  onClose,
  store,
  products = DEFAULT_PRODUCTS,
  sales = DEFAULT_SALES,
  returns = DEFAULT_RETURNS,
  currentUser,
  onOpenBatchRegister,
  initialProductToEdit,
  onProductUpdated,
  initialSpreadsheetProducts
}) => {
  const [activeChipCategory, setActiveChipCategory] = useState<'all' | 'guides' | 'actions' | 'analytics'>('all');

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `👋 **Hello Store Admin! I am your Mart Pro AI Supermarket Copilot & Software Expert.**\n\nI have complete visibility and live control over **"${store.name}"**:\n1. 📦 **All Store Products to Edit** — All ${products.length} registered products appear right here in Copilot! You can view, search, and edit their prices, wholesale costs, stock levels, barcodes, and discounts.\n2. 📊 **Complete Real-Time Visibility** — Live inventory, stock values at cost vs retail, profit margins, active discounts, top/least-selling products, cashier performance, and return ledgers.\n3. 📖 **Complete Software Mastery & Guidance** — Step-by-step guidance on every feature, POS counter shortcuts, and hardware setup.\n\n💡 **Get started right away:**\n• Switch to **"📦 All Products to Edit"** above to inspect or edit any item\n• Or ask in chat: *"Show all products to edit"*, *"Change price of Milk to 250"*, or *"Add 50 stock to Rice"*`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tab & Catalog Management State
  const [mainTab, setMainTab] = useState<'chat' | 'all_products'>('chat');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [catalogStockFilter, setCatalogStockFilter] = useState<'all' | 'low' | 'out' | 'discounted'>('all');
  const [catalogSort, setCatalogSort] = useState<'name_asc' | 'price_desc' | 'price_asc' | 'stock_asc' | 'stock_desc'>('name_asc');
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<Product | null>(null);

  const createEditDraft = (p: Product): ProductEditDraft => ({
    id: p.id,
    name: p.name,
    price: p.price,
    costPrice: p.costPrice ?? 0,
    stockQuantity: p.stockQuantity,
    minStockLevel: p.minStockLevel || 5,
    category: p.category || 'General',
    barcode: p.barcode || '',
    shortcutCode: p.shortcutCode,
    serialNumber: p.serialNumber || '',
    sellBy: p.sellBy || (p.unitType === 'kg' ? 'weight' : 'unit'),
    unitType: p.unitType || (p.sellBy === 'weight' ? 'kg' : 'piece'),
    weight: p.weight || '',
    originalProduct: p
  });

  const handleQuickStockUpdate = async (product: Product, delta: number) => {
    const current = Number(product.stockQuantity) || 0;
    const newStock = Math.max(0, Math.round((current + delta) * 1000) / 1000);
    try {
      const productRef = doc(db, 'products', product.id);
      await updateDoc(productRef, cleanFirestoreData({
        stockQuantity: newStock,
        updatedAt: new Date().toISOString()
      }));
      playScanSuccessBeep();
      const updatedProduct: Product = { ...product, stockQuantity: newStock };
      if (onProductUpdated) {
        onProductUpdated(updatedProduct);
      }
      if (selectedCatalogProduct?.id === product.id) {
        setSelectedCatalogProduct(updatedProduct);
      }
    } catch (err: any) {
      console.error('Failed to update stock:', err);
    }
  };

  const allStoreCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category.trim());
    });
    return Array.from(set).sort();
  }, [products]);

  const filteredCatalogProducts = useMemo(() => {
    const q = catalogSearch.toLowerCase().trim();
    let list = products.filter(p => {
      if (catalogCategory !== 'all' && (!p.category || p.category.toLowerCase().trim() !== catalogCategory.toLowerCase())) {
        return false;
      }
      if (catalogStockFilter === 'low') {
        const isLow = (p.stockQuantity ?? 0) > 0 && (p.stockQuantity ?? 0) <= (p.minStockLevel || 5);
        if (!isLow) return false;
      } else if (catalogStockFilter === 'out') {
        if ((p.stockQuantity ?? 0) > 0) return false;
      } else if (catalogStockFilter === 'discounted') {
        const isDisc = Boolean(p.discountActive || (p.discountValue && p.discountValue > 0));
        if (!isDisc) return false;
      }
      if (!q) return true;
      return (
        p.name?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        p.shortcutCode?.toLowerCase().includes(q) ||
        `#${p.shortcutCode}`.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      if (catalogSort === 'price_desc') return (b.price || 0) - (a.price || 0);
      if (catalogSort === 'price_asc') return (a.price || 0) - (b.price || 0);
      if (catalogSort === 'stock_desc') return (b.stockQuantity || 0) - (a.stockQuantity || 0);
      if (catalogSort === 'stock_asc') return (a.stockQuantity || 0) - (b.stockQuantity || 0);
      return (a.name || '').localeCompare(b.name || '');
    });

    return list;
  }, [products, catalogSearch, catalogCategory, catalogStockFilter, catalogSort]);

  // Live store intelligence metrics for Copilot
  const storeMetrics = useMemo(() => {
    const totalStockQty = products.reduce((acc, p) => acc + (p.stockQuantity || 0), 0);
    const totalRetailValue = products.reduce((acc, p) => acc + ((p.stockQuantity || 0) * (p.price || 0)), 0);
    const totalCostValue = products.reduce((acc, p) => acc + ((p.stockQuantity || 0) * (p.costPrice || 0)), 0);
    const lowStockCount = products.filter(p => (p.stockQuantity || 0) <= (p.minStockLevel || 5)).length;
    const discountedProductsCount = products.filter(p => p.discountActive || (p.discountValue && p.discountValue > 0)).length;
    const totalSalesAmount = sales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
    const totalDiscountsGiven = sales.reduce((acc, s) => acc + (s.discountAmount || 0), 0);

    return {
      totalStockQty,
      totalRetailValue,
      totalCostValue,
      lowStockCount,
      discountedProductsCount,
      totalSalesAmount,
      totalDiscountsGiven
    };
  }, [products, sales]);

  // Handle ESC key for full screen or modal exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (isOpen) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isOpen, onClose]);

  // Audio voice synthesis for reading AI Copilot advice aloud
  const handleSpeakMessage = (id: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speakingMessageId === id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanSpeech = text
      .replace(/[*_#`~]/g, '')
      .replace(/[•\-\d+\.]/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .slice(0, 320);
    const utter = new SpeechSynthesisUtterance(cleanSpeech);
    utter.rate = 0.95;
    utter.onend = () => setSpeakingMessageId(null);
    utter.onerror = () => setSpeakingMessageId(null);
    window.speechSynthesis.speak(utter);
    setSpeakingMessageId(id);
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleClearChat = () => {
    if (speakingMessageId && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
    }
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'ai',
        text: `👋 **Mart Pro AI Copilot session refreshed!**\n\nHow can I help you today? You can ask about sales figures, total discounts, inventory stock, software workflows, or request to edit any product.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  // Auto-activate Edit Mode when opened with initialProductToEdit
  useEffect(() => {
    if (isOpen && initialProductToEdit) {
      const editMsgId = `edit-init-${initialProductToEdit.id}-${Date.now()}`;
      setMessages(prev => {
        // Prevent duplicate draft for the exact same product if already present
        if (prev.some(m => m.productEditDraft?.id === initialProductToEdit.id && !m.productEditDraft?.saved)) {
          return prev;
        }
        return [
          ...prev,
          {
            id: editMsgId,
            sender: 'ai',
            text: `✏️ **Edit Product Mode: "${initialProductToEdit.name}"**\n\nI loaded this item from your catalog (Barcode: \`${initialProductToEdit.barcode || 'N/A'}\`). You can adjust its selling price, wholesale cost, stock, or details below, or type your instructions (e.g. *"Set price to 250"* or *"Add 20 to stock"*):`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            productEditDraft: {
              id: initialProductToEdit.id,
              name: initialProductToEdit.name,
              price: initialProductToEdit.price,
              costPrice: initialProductToEdit.costPrice ?? 0,
              stockQuantity: initialProductToEdit.stockQuantity,
              minStockLevel: initialProductToEdit.minStockLevel || 5,
              category: initialProductToEdit.category || 'General',
              barcode: initialProductToEdit.barcode || '',
              serialNumber: initialProductToEdit.serialNumber || '',
              sellBy: initialProductToEdit.sellBy || (initialProductToEdit.unitType === 'kg' ? 'weight' : 'unit'),
              unitType: initialProductToEdit.unitType || (initialProductToEdit.sellBy === 'weight' ? 'kg' : 'piece'),
              weight: initialProductToEdit.weight || '',
              originalProduct: initialProductToEdit
            }
          }
        ];
      });
    }
  }, [isOpen, initialProductToEdit]);

  // Handle in-app spreadsheet products sent to AI
  useEffect(() => {
    if (isOpen && initialSpreadsheetProducts && initialSpreadsheetProducts.length > 0) {
      const sheetMsgId = `sheet-import-${Date.now()}`;
      setMessages(prev => {
        if (prev.some(m => m.id === sheetMsgId)) return prev;
        return [
          ...prev,
          {
            id: sheetMsgId,
            sender: 'ai',
            text: `📋 **In-App Spreadsheet Received (${initialSpreadsheetProducts.length} Products):**\n\nI have parsed all your products with prices, categories, and barcodes. You can save them directly into "${store.name}" inventory by clicking the button below:`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            parsedProducts: initialSpreadsheetProducts
          }
        ];
      });
    }
  }, [isOpen, initialSpreadsheetProducts, store.name]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    }
  }, [isOpen, messages]);

  // Compute live analytics
  const storeAnalytics = useMemo(() => {
    const safeProducts = products || [];
    const safeSales = sales || [];

    // 1. Cheapest item
    const validProducts = safeProducts.filter(p => (p.price || 0) > 0);
    let cheapest = validProducts[0];
    let mostExpensive = validProducts[0];

    validProducts.forEach(p => {
      if ((p.price || 0) < (cheapest?.price || Infinity)) cheapest = p;
      if ((p.price || 0) > (mostExpensive?.price || 0)) mostExpensive = p;
    });

    // 2. Sales volume per product (Most and Least Selling)
    const productSalesMap = new Map<string, { name: string; barcode: string; unitsSold: number; totalRevenue: number }>();
    
    // Initialize map with all products (so we catch 0-sale items)
    safeProducts.forEach(p => {
      productSalesMap.set(p.name.toLowerCase().trim(), {
        name: p.name,
        barcode: p.barcode,
        unitsSold: 0,
        totalRevenue: 0
      });
    });

    safeSales.forEach(s => {
      (s.items || []).forEach(item => {
        const key = item.name.toLowerCase().trim();
        const existing = productSalesMap.get(key) || {
          name: item.name,
          barcode: item.barcode || '',
          unitsSold: 0,
          totalRevenue: 0
        };
        existing.unitsSold += (item.quantity || 0);
        existing.totalRevenue += ((item.price || 0) * (item.quantity || 0));
        productSalesMap.set(key, existing);
      });
    });

    const salesList = Array.from(productSalesMap.values());
    salesList.sort((a, b) => b.unitsSold - a.unitsSold);

    const mostSelling = salesList[0] || null;
    const leastSelling = [...salesList].reverse().filter(p => p.unitsSold === 0 || p.unitsSold <= 2).slice(0, 5);

    // 3. Low stock and out of stock
    const outOfStock = safeProducts.filter(p => (p.stockQuantity ?? 0) <= 0);
    const lowStock = safeProducts.filter(p => (p.stockQuantity ?? 0) > 0 && (p.stockQuantity ?? 0) <= (p.minStockLevel || 5));

    // 4. Today's sales
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySales = safeSales.filter(s => s.timestamp && s.timestamp.startsWith(todayStr));
    const todayTotal = todaySales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
    const todayUnits = todaySales.reduce((acc, s) => acc + (s.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0), 0);

    return {
      cheapest,
      mostExpensive,
      mostSelling,
      leastSelling,
      outOfStock,
      lowStock,
      todayTotal,
      todayUnits,
      todayReceipts: todaySales.length,
      totalProducts: safeProducts.length
    };
  }, [products, sales]);

  // Click handler when user selects a candidate product pill in chat
  const handleSelectCandidateToEdit = (product: Product) => {
    const editMsgId = `edit-cand-${product.id}-${Date.now()}`;
    const editMsg: Message = {
      id: editMsgId,
      sender: 'ai',
      text: `✏️ **Selected: "${product.name}"** (Barcode: \`${product.barcode || 'N/A'}\`)\n\nYou can tweak its selling price, wholesale cost, stock, or details in the interactive card below:`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      productEditDraft: {
        id: product.id,
        name: product.name,
        price: product.price,
        costPrice: product.costPrice ?? 0,
        stockQuantity: product.stockQuantity,
        minStockLevel: product.minStockLevel || 5,
        category: product.category || 'General',
        barcode: product.barcode || '',
        serialNumber: product.serialNumber || '',
        sellBy: product.sellBy || (product.unitType === 'kg' ? 'weight' : 'unit'),
        unitType: product.unitType || (product.sellBy === 'weight' ? 'kg' : 'piece'),
        weight: product.weight || '',
        originalProduct: product
      }
    };
    setMessages(prev => [...prev, editMsg]);
  };

  // Helper function to parse natural language instructions to ADD a new product with 4-digit shortcut code
  const parseAddNewProductInstruction = (queryText: string, allProducts: Product[]) => {
    const q = queryText.trim();
    const lower = q.toLowerCase();

    // Check if user is asking to add/create/register a new product
    const isAddQuery = /\b(add|create|register|insert|new)\s+(?:new\s+)?(?:product|item|good)\b/i.test(lower) ||
      /\b(?:add|insert)\s+([a-zA-Z0-9\s\-]+?)\s+(?:to\s+(?:store|inventory|catalog)|with\s+price|price|rate)/i.test(lower);

    if (!isAddQuery) {
      return { isAddIntent: false };
    }

    // Check if it's purely adding stock delta to an existing product (e.g. "add 20 stock to Milk")
    if (/\b(?:add|increase)\s+[0-9.]+\s*(?:units?|items?|stock|qty|kg|liters?)?\s*(?:to|for|in)\s+/i.test(lower)) {
      return { isAddIntent: false };
    }

    // Extract product name
    let name = '';
    // Pattern A: "add [new] product [name] price [N] ..."
    const nameMatch1 = queryText.match(/(?:add|create|register|insert|new)\s+(?:new\s+)?(?:product|item|item\s+called|product\s+called)?\s+["']?([^"'\n]+?)["']?\s+(?:with\s+)?(?:price|rate|cost|stock|quantity|qty|category|barcode|per|at|for)\s+/i);
    if (nameMatch1) {
      name = nameMatch1[1].replace(/^(product|item|called)\s+/i, '').trim();
    } else {
      // Pattern B: "add [name] price [N]"
      const nameMatch2 = queryText.match(/(?:add|create|register)\s+["']?([^"'\n]+?)["']?\s+(?:price|rate|at\s+rs|cost)\s+/i);
      if (nameMatch2) {
        name = nameMatch2[1].trim();
      }
    }

    // Fallback name if simple "add product Mango"
    if (!name) {
      const simpleMatch = queryText.match(/(?:add|create|register)\s+(?:new\s+)?(?:product|item)\s+["']?([^"'\n]+)["']?$/i);
      if (simpleMatch) {
        name = simpleMatch[1].trim();
      }
    }

    if (!name) {
      return { isAddIntent: false };
    }

    // Clean up name
    name = name.replace(/^(the|a|an)\s+/i, '').trim();

    // Extract Price
    let price = 0;
    const priceMatch = lower.match(/(?:price|rate|selling\s*price|at|for|is)\s*(?:of|is|:|=|to)?\s*(?:rs\.?|pkr)?\s*([0-9.]+)/i);
    if (priceMatch) {
      price = parseFloat(priceMatch[1]);
    }

    // Extract Cost Price
    let costPrice = 0;
    const costMatch = lower.match(/(?:cost|cost\s*price|buying\s*price|purchase\s*price)\s*(?:of|is|:|=|to)?\s*(?:rs\.?|pkr)?\s*([0-9.]+)/i);
    if (costMatch) {
      costPrice = parseFloat(costMatch[1]);
    } else if (price > 0) {
      costPrice = Math.round(price * 0.8 * 100) / 100;
    }

    // Extract Stock Quantity
    let stockQuantity = 50;
    const stockMatch = lower.match(/(?:stock|quantity|qty|units?)\s*(?:of|is|:|=|to)?\s*([0-9.]+)/i);
    if (stockMatch) {
      stockQuantity = parseFloat(stockMatch[1]);
    }

    // Extract Category
    let category = 'General';
    const catMatch = lower.match(/(?:category|dept|department)\s*(?:of|is|:|=|to)?\s*["']?([a-zA-Z0-9\s]+?)["']?(?:\s+(?:with|and|price|stock)|$)/i);
    if (catMatch) {
      category = catMatch[1].trim();
    }

    // Extract Sell By / Weight
    let sellBy: 'unit' | 'weight' = 'unit';
    let unitType: 'piece' | 'kg' | 'liter' = 'piece';
    if (/\b(per\s*kg|kg|kilogram|kilo|per\s*kilo)\b/i.test(lower)) {
      sellBy = 'weight';
      unitType = 'kg';
    } else if (/\b(per\s*liter|per\s*litre|liter|litre|ltr)\b/i.test(lower)) {
      sellBy = 'weight';
      unitType = 'liter';
    }

    // Extract or generate barcode
    let barcode = '';
    const barcodeMatch = lower.match(/barcode\s*(?:of|is|:|=|to)?\s*([0-9a-zA-Z]+)/i);
    if (barcodeMatch) {
      barcode = barcodeMatch[1].trim();
    } else {
      barcode = generateRandomBarcode();
    }

    // Generate unique 4-digit POS shortcut code
    const shortcutCode = generateNextShortcutCode(allProducts);

    return {
      isAddIntent: true,
      name,
      price: isNaN(price) ? 100 : price,
      costPrice: isNaN(costPrice) ? 80 : costPrice,
      stockQuantity: isNaN(stockQuantity) ? 50 : stockQuantity,
      category,
      sellBy,
      unitType,
      barcode,
      shortcutCode
    };
  };

  // Helper function to parse natural language product editing instructions
  const parseProductEditInstruction = (queryText: string, allProducts: Product[]) => {
    const q = queryText.trim();
    const lower = q.toLowerCase();

    // Check if query is just a generic edit command without target
    if (/^(edit\s+product|edit\s+products|edit\s+item|edit\s+items|how\s+to\s+edit|update\s+product|change\s+price|adjust\s+stock)$/i.test(lower)) {
      return {
        isEditIntent: true,
        candidates: allProducts.slice(0, 10),
        explanation: `I can edit any product in your inventory! Select one of the items below, or tell me which product and what to change (e.g. **"Change price of Milk to 250"** or **"Add 20 stock to Rice"**):`
      };
    }

    const hasEditVerb = /\b(edit|update|change|modify|set|adjust|make|rename|add|increase|reduce|decrease|cut)\b/i.test(lower);
    const hasPriceNoun = /\b(price|rate|cost|margin|selling price|cost price)\b/i.test(lower);
    const hasStockNoun = /\b(stock|quantity|qty|units?|inventory)\b/i.test(lower);

    if (!hasEditVerb && !hasPriceNoun && !hasStockNoun) {
      return { isEditIntent: false, candidates: [] };
    }

    // Extraction variables
    let extractedTarget = '';
    let newPrice: number | undefined;
    let priceDelta: number | undefined;
    let newCost: number | undefined;
    let newStock: number | undefined;
    let stockDelta: number | undefined;
    let newName: string | undefined;
    let newCategory: string | undefined;

    // Pattern 1: Rename "rename [product] to [newName]"
    const renameMatch = lower.match(/\brename\s+(?:the\s+)?(?:product\s+)?(.+?)\s+to\s+["']?([^"']+)["']?/i);
    if (renameMatch) {
      extractedTarget = renameMatch[1];
      newName = renameMatch[2].trim();
    }

    // Pattern 2: Category "change category of [product] to [category]"
    const catMatch = lower.match(/\b(?:change|update|set)\s+(?:the\s+)?category\s+(?:of\s+)?(.+?)\s+to\s+["']?([^"']+)["']?/i);
    if (catMatch && !extractedTarget) {
      extractedTarget = catMatch[1];
      newCategory = catMatch[2].trim();
    }

    // Pattern 3: Price "change price of [product] to [price]"
    const priceMatch1 = lower.match(/\b(?:change|update|set|make)\s+(?:the\s+)?(?:price|rate)\s+(?:of\s+)?(.+?)\s+(?:to|=|is|:)\s*(?:rs\.?|pkr)?\s*([0-9.]+)/i);
    if (priceMatch1 && !extractedTarget) {
      extractedTarget = priceMatch1[1];
      newPrice = parseFloat(priceMatch1[2]);
    }

    // Pattern 4: Price "change [product] price to [price]"
    const priceMatch2 = lower.match(/\b(?:change|update|set|make)\s+(.+?)\s+(?:price|rate)\s+(?:to|=|is|:)\s*(?:rs\.?|pkr)?\s*([0-9.]+)/i);
    if (priceMatch2 && !extractedTarget) {
      extractedTarget = priceMatch2[1];
      newPrice = parseFloat(priceMatch2[2]);
    }

    // Pattern 5: Price Delta "increase/decrease price of [product] by [delta]"
    const priceDeltaMatch = lower.match(/\b(increase|raise|decrease|reduce|cut)\s+(?:the\s+)?(?:price|rate)\s+(?:of\s+)?(.+?)\s+by\s*(?:rs\.?|pkr)?\s*([0-9.]+)/i);
    if (priceDeltaMatch && !extractedTarget) {
      const isIncrease = priceDeltaMatch[1] === 'increase' || priceDeltaMatch[1] === 'raise';
      extractedTarget = priceDeltaMatch[2];
      priceDelta = (isIncrease ? 1 : -1) * parseFloat(priceDeltaMatch[3]);
    }

    // Pattern 6: Cost Price "cost of [product] to [cost]"
    const costMatch = lower.match(/\b(?:change|update|set|make)\s+(?:the\s+)?(?:cost|cost\s*price|buying\s*price|purchase\s*price)\s+(?:of\s+)?(.+?)\s+(?:to|=|is|:)\s*(?:rs\.?|pkr)?\s*([0-9.]+)/i);
    if (costMatch && !extractedTarget) {
      extractedTarget = costMatch[1];
      newCost = parseFloat(costMatch[2]);
    }

    // Pattern 7: Stock "change stock of [product] to [stock]"
    const stockMatch1 = lower.match(/\b(?:change|update|set|make)\s+(?:the\s+)?(?:stock|quantity|qty)\s+(?:of\s+)?(.+?)\s+(?:to|=|is|:)\s*([0-9.]+)/i);
    if (stockMatch1 && !extractedTarget) {
      extractedTarget = stockMatch1[1];
      newStock = parseFloat(stockMatch1[2]);
    }

    // Pattern 8: Stock Delta "add [N] stock to [product]"
    const addStockMatch = lower.match(/\b(add|increase)\s+([0-9.]+)\s*(?:units?|items?|stock|qty|kg|liters?)?\s*(?:to|for|in)\s*(?:stock of\s*)?(.+)/i);
    if (addStockMatch && !extractedTarget) {
      stockDelta = parseFloat(addStockMatch[2]);
      extractedTarget = addStockMatch[3];
    }

    // Pattern 9: General "edit product [product]" or "edit [product]"
    const generalEditMatch = lower.match(/\b(?:edit|update|modify)\s+(?:product\s+|item\s+)?(.+)/i);
    if (generalEditMatch && !extractedTarget) {
      extractedTarget = generalEditMatch[1];
    }

    // Pattern 10: Loose "[product] price [number]"
    if (!extractedTarget) {
      const looseMatch = lower.match(/(.+?)\s+(?:price|rate)\s+(?:to|=|is|:)?\s*(?:rs\.?|pkr)?\s*([0-9.]+)/i);
      if (looseMatch) {
        extractedTarget = looseMatch[1];
        newPrice = parseFloat(looseMatch[2]);
      }
    }

    // Secondary clauses: "and stock to [N]"
    const secondaryStock = lower.match(/(?:and|\&)\s+(?:stock|qty)\s+(?:to|=|is|:)\s*([0-9.]+)/i);
    if (secondaryStock && newStock === undefined) {
      newStock = parseFloat(secondaryStock[1]);
    }

    // Secondary clauses: "and price to [N]"
    const secondaryPrice = lower.match(/(?:and|\&)\s+(?:price|rate)\s+(?:to|=|is|:)\s*(?:rs\.?|pkr)?\s*([0-9.]+)/i);
    if (secondaryPrice && newPrice === undefined) {
      newPrice = parseFloat(secondaryPrice[1]);
    }

    // Check for general catalog edit queries
    const isGeneralCatalogEdit = lower === 'edit product' || lower === 'edit products' || lower === 'all products' || lower === 'products' ||
      lower.includes('all products in store') || lower.includes('show all products') || lower.includes('products to edit') ||
      lower.includes('all products to edit') || lower.includes('edit all products') || lower.includes('all store products') ||
      lower.includes('view all products') || (lower.includes('edit') && !extractedTarget);

    if (isGeneralCatalogEdit && (!newPrice && !newStock && !newCost && !priceDelta && !stockDelta)) {
      return {
        isEditIntent: true,
        candidates: allProducts,
        explanation: `✏️ **Here are all ${allProducts.length} products registered in "${store.name}". Select any product or use the search box to edit its price, wholesale cost, stock, or details:**`
      };
    }

    // If still no target, test if any product in catalog is mentioned directly in the sentence
    if (!extractedTarget) {
      for (const p of allProducts) {
        if (lower.includes(p.name.toLowerCase())) {
          extractedTarget = p.name;
          break;
        }
      }
    }

    if (!extractedTarget) {
      if (lower.includes('edit') || lower.includes('update') || lower.includes('change') || lower.includes('modify')) {
        return {
          isEditIntent: true,
          candidates: allProducts,
          explanation: `✏️ **Here are all ${allProducts.length} products registered in "${store.name}". Select any product to edit:**`
        };
      }
      return { isEditIntent: false, candidates: [] };
    }

    // Clean target search term
    const cleanTerm = extractedTarget.trim().toLowerCase()
      .replace(/^(the|a|an|product|item)\s+/i, '')
      .replace(/\s+(price|stock|qty|cost|rate)$/i, '')
      .trim();

    if (!cleanTerm || ['product', 'products', 'item', 'items', 'all', 'all products', 'inventory', 'catalog'].includes(cleanTerm)) {
      return {
        isEditIntent: true,
        candidates: allProducts,
        explanation: `✏️ **Here are all ${allProducts.length} products registered in "${store.name}". Select any product to edit:**`
      };
    }

    // Search catalog
    let matched: Product | undefined = undefined;
    let candidateList: Product[] = [];

    // 1. Barcode match
    matched = allProducts.find(p => p.barcode && p.barcode.toLowerCase() === cleanTerm);

    // 2. S/N match
    if (!matched) {
      matched = allProducts.find(p => p.serialNumber && p.serialNumber.toLowerCase() === cleanTerm);
    }

    // 3. Exact name match
    if (!matched) {
      matched = allProducts.find(p => p.name.toLowerCase() === cleanTerm);
    }

    // 4. Substring matches
    if (!matched) {
      const subMatches = allProducts.filter(p => 
        p.name.toLowerCase().includes(cleanTerm) || cleanTerm.includes(p.name.toLowerCase())
      );
      if (subMatches.length === 1) {
        matched = subMatches[0];
      } else if (subMatches.length > 1) {
        candidateList = subMatches;
      }
    }

    // 5. Token matches
    if (!matched && candidateList.length === 0) {
      const tokens = cleanTerm.split(/\s+/).filter(t => t.length > 2);
      if (tokens.length > 0) {
        const tokenMatches = allProducts.filter(p => {
          const pLower = p.name.toLowerCase();
          return tokens.some(tok => pLower.includes(tok));
        });
        if (tokenMatches.length === 1) {
          matched = tokenMatches[0];
        } else if (tokenMatches.length > 1) {
          candidateList = tokenMatches;
        }
      }
    }

    if (matched) {
      const p = matched;
      const changesSummary: { field: string; label: string; from: string | number; to: string | number }[] = [];
      const draft: Partial<Product> = { ...p };

      if (newPrice !== undefined && !isNaN(newPrice)) {
        changesSummary.push({
          field: 'price',
          label: 'Selling Price',
          from: `Rs. ${p.price}`,
          to: `Rs. ${newPrice}`
        });
        draft.price = newPrice;
      } else if (priceDelta !== undefined && !isNaN(priceDelta)) {
        const calcPrice = Math.max(0, p.price + priceDelta);
        changesSummary.push({
          field: 'price',
          label: 'Selling Price',
          from: `Rs. ${p.price}`,
          to: `Rs. ${calcPrice}`
        });
        draft.price = calcPrice;
      }

      if (newCost !== undefined && !isNaN(newCost)) {
        changesSummary.push({
          field: 'costPrice',
          label: 'Wholesale Cost',
          from: `Rs. ${p.costPrice || 0}`,
          to: `Rs. ${newCost}`
        });
        draft.costPrice = newCost;
      }

      if (newStock !== undefined && !isNaN(newStock)) {
        changesSummary.push({
          field: 'stockQuantity',
          label: 'Stock Quantity',
          from: `${p.stockQuantity}`,
          to: `${newStock}`
        });
        draft.stockQuantity = newStock;
      } else if (stockDelta !== undefined && !isNaN(stockDelta)) {
        const calcStock = Math.max(0, p.stockQuantity + stockDelta);
        changesSummary.push({
          field: 'stockQuantity',
          label: 'Stock Quantity',
          from: `${p.stockQuantity}`,
          to: `${calcStock} (${stockDelta >= 0 ? `+${stockDelta}` : stockDelta})`
        });
        draft.stockQuantity = calcStock;
      }

      if (newName) {
        changesSummary.push({
          field: 'name',
          label: 'Product Name',
          from: p.name,
          to: newName
        });
        draft.name = newName;
      }

      if (newCategory) {
        changesSummary.push({
          field: 'category',
          label: 'Category',
          from: p.category || 'General',
          to: newCategory
        });
        draft.category = newCategory;
      }

      let explanation = '';
      if (changesSummary.length > 0) {
        explanation = `⚡ **AI Updates Prepared for "${p.name}"**\n\nI parsed your request and applied the updates to the draft card below. Review the changes and click **"Apply & Save Changes to Store"** to update your live inventory:`;
      } else {
        explanation = `✏️ **Found Product: "${p.name}"** (Barcode: \`${p.barcode || 'N/A'}\`)\n\nCurrent Price: **Rs. ${p.price.toFixed(2)}** • Stock: **${p.stockQuantity} ${p.sellBy === 'weight' ? 'kg' : 'units'}** • Cost: **Rs. ${(p.costPrice || 0).toFixed(2)}**.\n\nYou can adjust any values in the editor card below and click Save:`;
      }

      return {
        isEditIntent: true,
        matchedProduct: p,
        candidates: [p],
        changesSummary,
        draft,
        explanation
      };
    }

    if (candidateList.length > 0) {
      return {
        isEditIntent: true,
        candidates: candidateList,
        explanation: `I found ${candidateList.length} products matching **"${cleanTerm}"** in your inventory. Click the product you want to edit:`
      };
    }

    // Target specified but not found
    return {
      isEditIntent: true,
      candidates: allProducts,
      explanation: `I couldn't find a product matching **"${cleanTerm}"** in the catalog. Here are all ${allProducts.length} products in "${store.name}" to choose and edit:`
    };
  };

  const buildComprehensiveStoreContext = () => {
    const safeProducts = products || [];
    const safeSales = sales || [];
    const safeReturns = returns || [];

    // Summary statistics
    const totalProducts = safeProducts.length;
    const outOfStock = safeProducts.filter(p => (p.stockQuantity ?? 0) <= 0);
    const lowStock = safeProducts.filter(p => (p.stockQuantity ?? 0) > 0 && (p.stockQuantity ?? 0) <= (p.minStockLevel || 5));
    
    const totalStockUnits = safeProducts.reduce((sum, p) => sum + (Number(p.stockQuantity) || 0), 0);
    const totalInventoryCostValue = safeProducts.reduce((sum, p) => sum + ((Number(p.costPrice) || 0) * (Number(p.stockQuantity) || 0)), 0);
    const totalInventoryRetailValue = safeProducts.reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.stockQuantity) || 0)), 0);

    // Sales metrics by date
    const totalSalesRevenue = safeSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    const totalSalesCount = safeSales.length;

    const todayDate = new Date();
    const todayStr = todayDate.toISOString().slice(0, 10);
    const yesterdayDate = new Date(todayDate.getTime() - 86400000);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    const todaySales = safeSales.filter(s => s.timestamp && s.timestamp.startsWith(todayStr));
    const todayRevenue = todaySales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    const todayInvoices = todaySales.length;

    const yesterdaySales = safeSales.filter(s => s.timestamp && s.timestamp.startsWith(yesterdayStr));
    const yesterdayRevenue = yesterdaySales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    const yesterdayInvoices = yesterdaySales.length;

    // Discounts breakdown by date
    const calculateDiscountsForSales = (saleList: Sale[]) => {
      return saleList.reduce((sum, s) => {
        let saleDisc = Number(s.discountAmount) || 0;
        const itemDisc = (s.items || []).reduce((itemSum, it) => {
          if (it.originalPrice && it.originalPrice > it.price) {
            return itemSum + ((it.originalPrice - it.price) * (it.quantity || 1));
          }
          return itemSum;
        }, 0);
        return sum + Math.max(saleDisc, itemDisc);
      }, 0);
    };

    const todayDiscounts = calculateDiscountsForSales(todaySales);
    const yesterdayDiscounts = calculateDiscountsForSales(yesterdaySales);
    const totalDiscountsTillToday = calculateDiscountsForSales(safeSales);

    // Product sales breakdown (All-time, Today, Yesterday)
    const getTopSellersForList = (saleList: Sale[]) => {
      const map = new Map<string, { name: string; unitsSold: number; revenue: number }>();
      saleList.forEach(s => {
        (s.items || []).forEach(item => {
          const key = item.name.toLowerCase().trim();
          const existing = map.get(key) || { name: item.name, unitsSold: 0, revenue: 0 };
          existing.unitsSold += (item.quantity || 1);
          existing.revenue += (item.total || (item.price * (item.quantity || 1)));
          map.set(key, existing);
        });
      });
      return Array.from(map.values()).sort((a, b) => b.unitsSold - a.unitsSold);
    };

    const topSellersAllTime = getTopSellersForList(safeSales).slice(0, 10);
    const topSellersToday = getTopSellersForList(todaySales).slice(0, 5);
    const topSellersYesterday = getTopSellersForList(yesterdaySales).slice(0, 5);
    const slowMovers = safeProducts.filter(p => !topSellersAllTime.some(t => t.name.toLowerCase() === p.name.toLowerCase())).slice(0, 10).map(p => p.name);

    // Profitability per product
    const productProfitability = safeProducts.map(p => {
      const cost = Number(p.costPrice) || 0;
      const price = Number(p.price) || 0;
      const profitPerUnit = Math.round((price - cost) * 100) / 100;
      const profitMarginPercent = price > 0 ? Math.round(((price - cost) / price) * 10000) / 100 : 0;
      return {
        name: p.name,
        category: p.category || 'General',
        costPrice: cost,
        retailPrice: price,
        profitPerUnit,
        profitMarginPercent
      };
    });

    const highProfitProducts = [...productProfitability].sort((a, b) => b.profitMarginPercent - a.profitMarginPercent).slice(0, 5);
    const lowProfitProducts = [...productProfitability].sort((a, b) => a.profitMarginPercent - b.profitMarginPercent).slice(0, 5);

    // Active discounts
    const discountedProducts = safeProducts.filter(p => p.discountActive && (p.discountValue ?? 0) > 0);

    // Returns
    const totalRefundAmount = safeReturns.reduce((sum, r) => sum + (Number(r.refundAmount) || 0), 0);

    return {
      storeName: store.name,
      currency: store.currencySymbol || 'Rs.',
      adminUsername: store.adminUsername,
      phone: store.phone,
      address: store.address,
      taxRegistrationNumber: store.taxRegistrationNumber,
      returnPolicyDays: store.returnPolicyDays || 7,
      inventorySummary: {
        totalProducts,
        totalStockUnits,
        totalInventoryCostValue: Math.round(totalInventoryCostValue * 100) / 100,
        totalInventoryRetailValue: Math.round(totalInventoryRetailValue * 100) / 100,
        potentialGrossMargin: Math.round((totalInventoryRetailValue - totalInventoryCostValue) * 100) / 100,
        outOfStockCount: outOfStock.length,
        outOfStockItems: outOfStock.slice(0, 15).map(p => ({ name: p.name, barcode: p.barcode, category: p.category })),
        lowStockCount: lowStock.length,
        lowStockItems: lowStock.slice(0, 15).map(p => ({ name: p.name, currentStock: p.stockQuantity, minThreshold: p.minStockLevel || 5, price: p.price }))
      },
      salesSummary: {
        totalSalesCount,
        totalSalesRevenue: Math.round(totalSalesRevenue * 100) / 100,
        todayDate: todayStr,
        todayRevenue: Math.round(todayRevenue * 100) / 100,
        todayInvoices,
        topSellingToday: topSellersToday,
        yesterdayDate: yesterdayStr,
        yesterdayRevenue: Math.round(yesterdayRevenue * 100) / 100,
        yesterdayInvoices,
        topSellingYesterday: topSellersYesterday,
        topSellingAllTime: topSellersAllTime,
        slowMovingProducts: slowMovers
      },
      profitabilitySummary: {
        highProfitProducts,
        lowProfitProducts
      },
      discountsSummary: {
        todayDiscountsGiven: Math.round(todayDiscounts * 100) / 100,
        yesterdayDiscountsGiven: Math.round(yesterdayDiscounts * 100) / 100,
        totalDiscountsTillToday: Math.round(totalDiscountsTillToday * 100) / 100,
        activePromotionalProductsCount: discountedProducts.length,
        discountedProductsList: discountedProducts.map(p => ({
          name: p.name,
          originalPrice: p.price,
          discountType: p.discountType,
          discountValue: p.discountValue
        }))
      },
      returnsSummary: {
        totalReturnsCount: safeReturns.length,
        totalRefundAmount: Math.round(totalRefundAmount * 100) / 100
      },
      sampleProductsCatalog: safeProducts.slice(0, 50).map(p => ({
        name: p.name,
        price: p.price,
        costPrice: p.costPrice || 0,
        stockQuantity: p.stockQuantity,
        category: p.category || 'General',
        barcode: p.barcode,
        shortcutCode: p.shortcutCode,
        sellBy: p.sellBy || 'unit'
      }))
    };
  };

  // Intelligent query engine
  const handleAskQuestion = (questionText: string) => {
    if (!questionText.trim()) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: questionText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    setTimeout(async () => {
      const safeProducts = products || [];

      // Check for ADD NEW PRODUCT intent first (e.g. "Add product Mango price 300 stock 50")
      const addResult = parseAddNewProductInstruction(questionText, safeProducts);
      if (addResult.isAddIntent && addResult.name) {
        const prodId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const newProductObj: Product = {
          id: prodId,
          storeId: store.id,
          name: addResult.name,
          price: addResult.price,
          pricePerKg: addResult.sellBy === 'weight' ? addResult.price : undefined,
          costPrice: addResult.costPrice,
          stockQuantity: addResult.stockQuantity,
          minStockLevel: 5,
          category: addResult.category,
          barcode: addResult.barcode,
          shortcutCode: addResult.shortcutCode,
          serialNumber: addResult.shortcutCode,
          sellBy: addResult.sellBy,
          unitType: addResult.unitType,
          weight: addResult.sellBy === 'weight' ? (addResult.unitType === 'kg' ? '1 kg' : '1 Liter') : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        try {
          // Write to Firestore
          await setDoc(doc(db, 'products', prodId), cleanFirestoreData(newProductObj), { merge: true });
          playScanSuccessBeep();
          if (onProductUpdated) onProductUpdated(newProductObj);

          const replyText = `🎉 **Successfully Added & Registered New Product to "${store.name}"!**\n\n` +
            `• **Product Name:** **${addResult.name}**\n` +
            `• **🔢 4-Digit POS Shortcut Code:** **#${addResult.shortcutCode}**\n` +
            `  *(Cashiers can type \`${addResult.shortcutCode}\` anywhere at the Cash Counter POS to instantly add to cart!)*\n` +
            `• **Retail Selling Price:** Rs. ${addResult.price.toFixed(2)}${addResult.sellBy === 'weight' ? ` per ${addResult.unitType}` : ''}\n` +
            `• **Wholesale Cost Price:** Rs. ${addResult.costPrice.toFixed(2)}\n` +
            `• **Stock Quantity:** ${addResult.stockQuantity} ${addResult.sellBy === 'weight' ? addResult.unitType : 'units'}\n` +
            `• **Barcode:** \`${addResult.barcode}\`\n` +
            `• **Category:** ${addResult.category}\n\n` +
            `*The product is live in your catalog and synchronized across all POS counters.*`;

          const aiMsg: Message = {
            id: `msg-${Date.now() + 1}`,
            sender: 'ai',
            text: replyText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            productEditDraft: {
              id: prodId,
              name: addResult.name,
              price: addResult.price,
              costPrice: addResult.costPrice,
              stockQuantity: addResult.stockQuantity,
              minStockLevel: 5,
              category: addResult.category,
              barcode: addResult.barcode,
              shortcutCode: addResult.shortcutCode,
              serialNumber: addResult.barcode,
              sellBy: addResult.sellBy,
              unitType: addResult.unitType,
              originalProduct: newProductObj,
              saved: true
            }
          };

          setMessages(prev => [...prev, aiMsg]);
        } catch (e: any) {
          setMessages(prev => [...prev, {
            id: `msg-${Date.now() + 1}`,
            sender: 'ai',
            text: `⚠️ Could not save product to database: ${e?.message || 'Error occurred'}. Please try again.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }]);
        }

        setIsProcessing(false);
        return;
      }

      // Check for product editing commands next
      const editResult = parseProductEditInstruction(questionText, safeProducts);
      if (editResult.isEditIntent) {
        if (editResult.matchedProduct) {
          const aiMsg: Message = {
            id: `msg-${Date.now() + 1}`,
            sender: 'ai',
            text: editResult.explanation || `I found **${editResult.matchedProduct.name}**. You can update its price, cost, stock, or details below:`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            productEditDraft: {
              id: editResult.matchedProduct.id,
              name: editResult.draft?.name || editResult.matchedProduct.name,
              price: editResult.draft?.price !== undefined ? editResult.draft.price : editResult.matchedProduct.price,
              costPrice: editResult.draft?.costPrice !== undefined ? editResult.draft.costPrice : (editResult.matchedProduct.costPrice || 0),
              stockQuantity: editResult.draft?.stockQuantity !== undefined ? editResult.draft.stockQuantity : editResult.matchedProduct.stockQuantity,
              minStockLevel: editResult.draft?.minStockLevel || editResult.matchedProduct.minStockLevel || 5,
              category: editResult.draft?.category || editResult.matchedProduct.category || 'General',
              barcode: editResult.draft?.barcode || editResult.matchedProduct.barcode || '',
              shortcutCode: editResult.matchedProduct.shortcutCode,
              serialNumber: editResult.draft?.serialNumber || editResult.matchedProduct.serialNumber || '',
              sellBy: editResult.draft?.sellBy || editResult.matchedProduct.sellBy || (editResult.matchedProduct.unitType === 'kg' ? 'weight' : 'unit'),
              unitType: editResult.draft?.unitType || editResult.matchedProduct.unitType || (editResult.matchedProduct.sellBy === 'weight' ? 'kg' : 'piece'),
              weight: editResult.draft?.weight || editResult.matchedProduct.weight || '',
              changesSummary: editResult.changesSummary,
              originalProduct: editResult.matchedProduct
            }
          };
          setMessages(prev => [...prev, aiMsg]);
          setIsProcessing(false);
          return;
        }

        if (editResult.candidates && editResult.candidates.length > 0) {
          const aiMsg: Message = {
            id: `msg-${Date.now() + 1}`,
            sender: 'ai',
            text: editResult.explanation || `I found multiple matching products in your inventory. Which one would you like to edit?`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            productCandidates: editResult.candidates
          };
          setMessages(prev => [...prev, aiMsg]);
          setIsProcessing(false);
          return;
        }
      }

      // Query server-side Gemini AI Copilot endpoint with full store knowledge
      try {
        const storeContext = buildComprehensiveStoreContext();
        const history = messages.slice(-6).map(m => ({
          role: m.sender === 'user' ? 'user' : 'model',
          text: m.text
        }));

        const response = await fetch('/api/ai/store-copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: questionText,
            storeContext,
            conversationHistory: history
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.reply) {
            const aiMsg: Message = {
              id: `msg-${Date.now() + 1}`,
              sender: 'ai',
              text: data.reply,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prev => [...prev, aiMsg]);
            setIsProcessing(false);
            return;
          }
        }
      } catch (copilotErr) {
        console.warn('AI Copilot server route failed, using local engine fallback:', copilotErr);
      }

      // Offline / Local engine fallback
      const q = questionText.toLowerCase();
      let reply = '';
      let candidates: Product[] | undefined = undefined;

      // Smart Query Resolution for Software Help Guides & Category/Product Specific Queries
      const engineRes = processStoreAiQuery(questionText, safeProducts, sales);
      if (engineRes.intent === 'guide' || engineRes.intent !== 'general' || engineRes.matchedProducts.length > 0) {
        reply = engineRes.reply;
        if (engineRes.matchedProducts.length > 0) {
          candidates = engineRes.matchedProducts;
        }
      }
      // Check for 4-Digit Shortcut queries if not handled by guide
      else if (!reply && (q.includes('shortcut') || q.includes('short cut') || q.includes('4-digit') || q.includes('4 digit') || q.includes('short code') || q.includes('pos code'))) {
        let matchedProd = safeProducts.find(p => p.name && q.includes(p.name.toLowerCase()));
        if (matchedProd) {
          reply = `🔢 **4-Digit POS Shortcut Code for "${matchedProd.name}":**\n\n• **Shortcut Code:** **#${matchedProd.shortcutCode || 'N/A'}**\n• **Retail Price:** Rs. ${matchedProd.price.toFixed(2)}${matchedProd.sellBy === 'weight' ? `/${matchedProd.unitType || 'kg'}` : ''}\n• **Barcode:** \`${matchedProd.barcode || 'N/A'}\`\n• **Available Stock:** ${matchedProd.stockQuantity} ${matchedProd.sellBy === 'weight' ? matchedProd.unitType || 'kg' : 'units'}\n\n💡 **Tip:** Cashiers can type \`${matchedProd.shortcutCode}\` anywhere at the cash counter or press \`S+K\` to view all shortcuts!`;
          candidates = [matchedProd];
        } else {
          const sampleList = safeProducts.slice(0, 6).map(p => `• **${p.name}**: \`#${p.shortcutCode || '----'}\` (Rs. ${p.price.toFixed(2)})`).join('\n');
          reply = `🔢 **4-Digit POS Product Shortcuts:**\n\n${sampleList}\n\n💡 **How to use 4-digit shortcuts:**\n1. Press **S + K** anywhere at the Cash Counter to open the Shortcuts Directory.\n2. Or simply type any 4-digit code (e.g. \`1001\`) into the barcode scanner box at checkout to instantly add item to cart!`;
        }
      }
      // 1. Cheapest item (storewide)
      else if (q.includes('cheap') || q.includes('lowest price') || q.includes('least price') || q.includes('minimum price')) {
        if (storeAnalytics.cheapest) {
          reply = `💰 **Cheapest Item in Store:**\n• **Product:** ${storeAnalytics.cheapest.name}\n• **Selling Price:** Rs. ${storeAnalytics.cheapest.price.toFixed(2)} (${storeAnalytics.cheapest.sellBy === 'weight' ? `per ${storeAnalytics.cheapest.unitType || 'kg'}` : 'per piece'})\n• **Barcode:** \`${storeAnalytics.cheapest.barcode}\`\n• **Current Stock:** ${storeAnalytics.cheapest.stockQuantity} remaining\n• **Category:** ${storeAnalytics.cheapest.category || 'General'}`;
          candidates = [storeAnalytics.cheapest];
        } else {
          reply = "There are currently no products with active pricing registered in the catalog.";
        }
      }
      // 2. Most expensive item
      else if (q.includes('expensive') || q.includes('highest price') || q.includes('costliest') || q.includes('maximum price')) {
        if (storeAnalytics.mostExpensive) {
          reply = `💎 **Most Expensive Item in Store:**\n• **Product:** ${storeAnalytics.mostExpensive.name}\n• **Selling Price:** Rs. ${storeAnalytics.mostExpensive.price.toFixed(2)} (${storeAnalytics.mostExpensive.sellBy === 'weight' ? `per ${storeAnalytics.mostExpensive.unitType || 'kg'}` : 'per piece'})\n• **Barcode:** \`${storeAnalytics.mostExpensive.barcode}\`\n• **Current Stock:** ${storeAnalytics.mostExpensive.stockQuantity} remaining\n• **Category:** ${storeAnalytics.mostExpensive.category || 'General'}`;
        } else {
          reply = "No product pricing found in inventory.";
        }
      }
      // 3. Most selling item
      else if (q.includes('most selling') || q.includes('best seller') || q.includes('top selling') || q.includes('highest selling') || q.includes('popular item')) {
        if (storeAnalytics.mostSelling && storeAnalytics.mostSelling.unitsSold > 0) {
          reply = `🔥 **Top / Most Selling Item:**\n• **Product:** ${storeAnalytics.mostSelling.name}\n• **Total Units Sold:** ${storeAnalytics.mostSelling.unitsSold.toLocaleString()} units\n• **Total Revenue Generated:** Rs. ${storeAnalytics.mostSelling.totalRevenue.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n• **Barcode:** \`${storeAnalytics.mostSelling.barcode || 'N/A'}\``;
        } else {
          reply = "No sales have been recorded yet to determine the top-selling product. Start ringing up orders at the Cash Counter POS!";
        }
      }
      // 4. Least selling item
      else if (q.includes('least selling') || q.includes('lowest selling') || q.includes('slow moving') || q.includes('dead stock') || q.includes('worst selling') || q.includes('unsold')) {
        if (storeAnalytics.leastSelling.length > 0) {
          const listStr = storeAnalytics.leastSelling
            .map(item => `• **${item.name}**: ${item.unitsSold} units sold (Revenue: Rs. ${item.totalRevenue.toFixed(2)})`)
            .join('\n');
          reply = `📉 **Least Selling / Slow-Moving Items:**\n${listStr}\n\n*Tip:* Consider creating promotional discounts or bundle offers for these slow-moving products.`;
        } else {
          reply = "All products currently in the catalog are selling actively!";
        }
      }
      // 5. Low stock or out of stock
      else if (q.includes('low stock') || q.includes('out of stock') || q.includes('stock alert') || q.includes('reorder')) {
        let stockMsg = `📦 **Inventory Stock Status:**\n• **Total Products:** ${storeAnalytics.totalProducts}\n• **Out of Stock:** ${storeAnalytics.outOfStock.length} items\n• **Low Stock (<5):** ${storeAnalytics.lowStock.length} items\n\n`;
        if (storeAnalytics.outOfStock.length > 0) {
          stockMsg += `🚨 **Out of Stock Items:**\n${storeAnalytics.outOfStock.slice(0, 5).map(p => `• ${p.name} (0 stock)`).join('\n')}\n\n`;
        }
        if (storeAnalytics.lowStock.length > 0) {
          stockMsg += `⚠️ **Low Stock Items:**\n${storeAnalytics.lowStock.slice(0, 5).map(p => `• ${p.name} (${p.stockQuantity} remaining)`).join('\n')}`;
        }
        reply = stockMsg;
      }
      // 6. Today's sales
      else if (q.includes('today') || q.includes('todays sales') || q.includes('daily sale') || q.includes('current revenue')) {
        reply = `📊 **Today's Store Performance (${new Date().toLocaleDateString()}):**\n• **Net Sales Revenue:** Rs. ${storeAnalytics.todayTotal.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n• **Units Sold:** ${storeAnalytics.todayUnits.toLocaleString()} units\n• **Completed Invoices:** ${storeAnalytics.todayReceipts} receipts\n\nCheck the **Store Admin Dashboard** for full day-by-day charts and breakdown tables!`;
      }
      // Default general AI response
      else {
        reply = `I understand you are asking about: "${questionText}".\n\nAs your Mart Pro Supermarket AI, I have full visibility into your inventory, sales, expenses, discounts, and cashier records. You can ask me:\n• Today's total sales, gross profit, and revenue\n• Inventory value at cost vs retail price\n• Which items to reorder from suppliers\n• How much discount was given this month\n• Cashier and counter performance\n• Or tell me to update prices or stock!`;
      }

      const aiMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        sender: 'ai',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        productCandidates: candidates
      };

      setMessages(prev => [...prev, aiMsg]);
      setIsProcessing(false);
    }, 400);
  };

  // Handle Excel upload inside the AI Chat
  const handleChatExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: `📁 Uploaded product file: **${file.name}**. Please list these products and help me add them to the store.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const parsed = await parseExcelProductFile(file);
      if (parsed.length === 0) {
        throw new Error('No valid product rows were detected in the spreadsheet.');
      }

      const sampleList = parsed.slice(0, 6).map(p => 
        `• **${p.name}** | Barcode: \`${p.barcode}\` | Rate: Rs. ${p.price.toFixed(2)}${p.sellBy === 'weight' ? `/${p.unitType}` : ''} | Qty: ${p.quantity}`
      ).join('\n');

      const extraCount = parsed.length > 6 ? `\n...and ${parsed.length - 6} more products.` : '';

      const aiReply: Message = {
        id: `msg-${Date.now() + 1}`,
        sender: 'ai',
        text: `✅ I analyzed **${file.name}** and extracted **${parsed.length} products** with their barcodes, quantities, and prices per unit/kg/liter!\n\n**Preview of extracted products:**\n${sampleList}${extraCount}\n\nYou can click the button below to automatically list and save all **${parsed.length} products** directly into your **${store.name}** inventory!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        parsedProducts: parsed
      };

      setMessages(prev => [...prev, aiReply]);
    } catch (err: any) {
      const errorReply: Message = {
        id: `msg-${Date.now() + 1}`,
        sender: 'ai',
        text: `⚠️ Error reading spreadsheet: ${err.message || 'Could not parse file'}. Please ensure the file has columns for Product Name, Price, and Quantity.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorReply]);
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Commit parsed products from AI directly into Firestore with automatic barcode stock updates
  const handleCommitParsedProducts = async (msgId: string, productsToSave: BatchProductRow[]) => {
    setIsProcessing(true);
    try {
      let saved = 0;
      let updatedCount = 0;
      let newCount = 0;
      const assignedPool = [...(products || [])];
      const savedShortcuts: Array<{ name: string; code: string; isUpdate?: boolean }> = [];

      for (const p of productsToSave) {
        const barcodeTrimmed = p.barcode ? p.barcode.trim() : '';
        
        // Match existing product in store database by full barcode
        const existing = barcodeTrimmed 
          ? (products || []).find(prod => prod.barcode && prod.barcode.trim().toLowerCase() === barcodeTrimmed.toLowerCase())
          : undefined;

        const prodId = existing ? existing.id : `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const shortcutCode = existing?.shortcutCode || p.shortcutCode || generateNextShortcutCode(assignedPool);

        if (!existing) {
          assignedPool.push({ shortcutCode } as Product);
        }
        savedShortcuts.push({ name: p.name || existing?.name || 'Product', code: shortcutCode, isUpdate: !!existing });

        // Update stock: add new quantity to existing stock quantity, and update cost price & selling price
        const updatedQty = existing ? (existing.stockQuantity || 0) + Number(p.quantity || 0) : Number(p.quantity || 0);
        const updatedSellingPrice = Number(p.price) > 0 ? Number(p.price) : (existing?.price || 0);
        const updatedCostPrice = Number(p.costPrice) > 0 ? Number(p.costPrice) : (existing?.costPrice || 0);

        await setDoc(doc(db, 'products', prodId), cleanFirestoreData({
          id: prodId,
          storeId: store.id,
          barcode: barcodeTrimmed || (existing?.barcode || ''),
          serialNumber: p.serialNumber || barcodeTrimmed || (existing?.serialNumber || shortcutCode),
          shortcutCode: shortcutCode,
          name: p.name?.trim() || existing?.name || 'Unnamed Product',
          category: p.category?.trim() || existing?.category || 'General',
          sellBy: p.sellBy || existing?.sellBy || 'unit',
          unitType: p.unitType || existing?.unitType || 'piece',
          price: updatedSellingPrice,
          costPrice: updatedCostPrice,
          stockQuantity: updatedQty,
          minStockLevel: existing?.minStockLevel || 5,
          weight: p.sellBy === 'weight' ? (p.unitType === 'kg' ? '1 kg' : '1 Liter') : existing?.weight,
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }), { merge: true });

        if (existing) {
          updatedCount++;
        } else {
          newCount++;
        }
        saved++;
      }

      const shortcutSummary = savedShortcuts.slice(0, 6)
        .map(s => `• **${s.name}** (\`#${s.code}\`): ${s.isUpdate ? '🔄 Stock & Price Updated' : '✨ New Product Saved'}`)
        .join('\n');
      const extraShortcuts = savedShortcuts.length > 6 ? `\n...and ${savedShortcuts.length - 6} more processed with assigned 4-digit codes.` : '';

      setMessages(prev => prev.map(m => {
        if (m.id === msgId) {
          return {
            ...m,
            actionTaken: true,
            text: m.text + `\n\n🎉 **Processed ${saved} products for "${store.name}"!**\n• **${newCount} New Products** registered into inventory.\n• **${updatedCount} Existing Products** updated with new stock quantity, cost price, and selling price.\n\n🔢 **Product POS Shortcut Status:**\n${shortcutSummary}${extraShortcuts}\n\nThey are live and updated in your store catalog!`
          };
        }
        return m;
      }));
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: `⚠️ **Error saving products:** ${err?.message || 'Could not write to database'}. Please check your connection and try again.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={isFullscreen 
      ? "fixed inset-0 z-[100] flex flex-col bg-slate-950 p-0 overflow-hidden" 
      : "fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 bg-slate-900/75 backdrop-blur-sm overflow-y-auto"
    }>
      <div className={isFullscreen
        ? "bg-white w-full h-full flex flex-col overflow-hidden"
        : "bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl lg:max-w-4xl h-[88vh] max-h-[850px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto"
      }>
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-600 text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-wide">Mart Pro Store AI Copilot</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Live Intelligence
                </span>
                {isFullscreen && (
                  <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                    Full Screen Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 font-medium">
                {store.name} • {products.length} Products • {sales.length} Invoices
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Full Screen Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFullscreen(prev => !prev)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-all flex items-center gap-1.5 text-xs font-bold border border-slate-700 cursor-pointer shadow-xs"
              title={isFullscreen ? "Exit Fullscreen (Esc)" : "Full Screen Mode"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-4 h-4 text-orange-400" />
                  <span className="hidden sm:inline">Exit Fullscreen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 text-orange-400" />
                  <span className="hidden sm:inline">Full Screen</span>
                </>
              )}
            </button>

            {/* Clear Chat Button */}
            <button
              type="button"
              onClick={handleClearChat}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Reset conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Close Copilot"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Real-Time KPI Banner in Full Screen Mode */}
        {isFullscreen && (
          <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs shrink-0">
            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                <DollarSign className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400 font-bold uppercase truncate">Total Revenue</div>
                <div className="font-extrabold text-white text-sm truncate">
                  {store.currencySymbol || 'Rs.'} {storeMetrics.totalSalesAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-emerald-400 font-medium">{sales.length} Invoices Recorded</div>
              </div>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400 shrink-0">
                <Tag className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400 font-bold uppercase truncate">Customer Discounts</div>
                <div className="font-extrabold text-orange-400 text-sm truncate">
                  {store.currencySymbol || 'Rs.'} {storeMetrics.totalDiscountsGiven.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-300 font-medium">{storeMetrics.discountedProductsCount} Discounted Items</div>
              </div>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 shrink-0">
                <Boxes className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400 font-bold uppercase truncate">Inventory Retail Value</div>
                <div className="font-extrabold text-white text-sm truncate">
                  {store.currencySymbol || 'Rs.'} {storeMetrics.totalRetailValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-[10px] text-slate-400 font-medium">Cost: {store.currencySymbol || 'Rs.'} {storeMetrics.totalCostValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
              </div>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 shrink-0">
                <Package className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400 font-bold uppercase truncate">Stock Health</div>
                <div className="font-extrabold text-white text-sm truncate">{products.length} Products</div>
                <div className={`text-[10px] font-bold ${storeMetrics.lowStockCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {storeMetrics.lowStockCount > 0 ? `⚠️ ${storeMetrics.lowStockCount} Low / Out of Stock` : '✅ All Stock Optimal'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="px-3 pt-2 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto custom-scrollbar text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setMainTab('chat'); }}
              className={`px-3 py-1.5 rounded-t-lg font-bold transition-all cursor-pointer border-b-2 flex items-center gap-1.5 ${
                mainTab === 'chat'
                  ? 'bg-white text-orange-600 border-orange-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              <span>💬 AI Copilot Chat</span>
            </button>

            <button
              type="button"
              onClick={() => { setMainTab('all_products'); setSelectedCatalogProduct(null); }}
              className={`px-3 py-1.5 rounded-t-lg font-bold transition-all cursor-pointer border-b-2 flex items-center gap-1.5 ${
                mainTab === 'all_products'
                  ? 'bg-white text-orange-600 border-orange-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/50'
              }`}
            >
              <Boxes className="w-3.5 h-3.5 text-orange-500" />
              <span>📦 All Products to Edit</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-100 text-orange-700">
                {products.length}
              </span>
            </button>
          </div>

          {mainTab === 'chat' && (
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setActiveChipCategory('all')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${activeChipCategory === 'all' ? 'bg-orange-100 text-orange-800' : 'text-slate-500 hover:text-slate-800'}`}
              >
                All Topics
              </button>
              <button
                type="button"
                onClick={() => setActiveChipCategory('guides')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${activeChipCategory === 'guides' ? 'bg-orange-100 text-orange-800' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Guides
              </button>
              <button
                type="button"
                onClick={() => setActiveChipCategory('actions')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${activeChipCategory === 'actions' ? 'bg-orange-100 text-orange-800' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Actions
              </button>
              <button
                type="button"
                onClick={() => setActiveChipCategory('analytics')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${activeChipCategory === 'analytics' ? 'bg-orange-100 text-orange-800' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Analytics
              </button>
            </div>
          )}
        </div>

        {/* Quick Suggestion Chips (Chat Mode) */}
        {mainTab === 'chat' && (
          <div className="p-2.5 bg-slate-50/80 border-b border-slate-200 overflow-x-auto flex items-center gap-1.5 custom-scrollbar text-xs shrink-0">
            {(activeChipCategory === 'all' || activeChipCategory === 'actions') && (
              <>
                <button
                  onClick={() => {
                    setMainTab('all_products');
                    setSelectedCatalogProduct(null);
                  }}
                  className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg whitespace-nowrap transition-colors font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Boxes className="w-3.5 h-3.5 text-amber-200" />
                  <span>📦 All Store Products ({products.length})</span>
                </button>
                <button
                  onClick={() => handleAskQuestion("Show all products in store to edit")}
                  className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-orange-500" />
                  <span>✏️ Edit in Chat</span>
                </button>
                <button
                  onClick={() => handleAskQuestion("Change price of an item")}
                  className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
                >
                  💰 Change Price
                </button>
                <button
                  onClick={() => handleAskQuestion("Update stock of an item")}
                  className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
                >
                  📦 Update Stock
                </button>
              </>
            )}

          {(activeChipCategory === 'all' || activeChipCategory === 'guides') && (
            <>
              <button
                onClick={() => handleAskQuestion("How to use POS counter and cash register?")}
                className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg whitespace-nowrap transition-colors font-bold flex items-center gap-1 cursor-pointer shadow-xs"
              >
                🛒 How to Use POS Counter
              </button>
              <button
                onClick={() => handleAskQuestion("How to use product register to add and manage products?")}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg whitespace-nowrap transition-colors font-bold flex items-center gap-1 cursor-pointer shadow-xs"
              >
                📦 Product Register Guide
              </button>
              <button
                onClick={() => handleAskQuestion("What features are available in admin dashboard and how to use it?")}
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg whitespace-nowrap transition-colors font-bold flex items-center gap-1 cursor-pointer shadow-xs"
              >
                🏢 Admin Dashboard Features
              </button>
              <button
                onClick={() => handleAskQuestion("How to use store admin dashboard step by step?")}
                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg whitespace-nowrap transition-colors font-bold flex items-center gap-1 cursor-pointer shadow-xs"
              >
                ⚙️ How to Use Admin
              </button>
              <button
                onClick={() => handleAskQuestion("What are all the POS keyboard shortcuts?")}
                className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg border border-blue-200 whitespace-nowrap transition-colors font-semibold flex items-center gap-1 cursor-pointer"
              >
                ⌨️ Shortcuts Guide
              </button>
              <button
                onClick={() => handleAskQuestion("How do I hold a bill and resume it later?")}
                className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                🛒 Hold & Resume Bills
              </button>
              <button
                onClick={() => handleAskQuestion("How do I set discounts and promotions for customers?")}
                className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                🏷️ Set Discounts
              </button>
              <button
                onClick={() => handleAskQuestion("How do I process product returns and refund vouchers?")}
                className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                🔄 Process Returns
              </button>
              <button
                onClick={() => handleAskQuestion("How do I register products by weight with price per kg or per liter?")}
                className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                ⚖️ Weight & Per-Kg
              </button>
              <button
                onClick={() => handleAskQuestion("How do I print thermal receipts and configure receipt format?")}
                className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                🖨️ Thermal Printing
              </button>
              <button
                onClick={() => handleAskQuestion("How do I bulk import products from Excel or CSV?")}
                className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                📊 Excel Import
              </button>
            </>
          )}

          {(activeChipCategory === 'all' || activeChipCategory === 'analytics') && (
            <>
              <button
                onClick={() => handleAskQuestion("What are the total customer discounts given today and till today, and which items are on discount?")}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-200 whitespace-nowrap transition-colors font-semibold flex items-center gap-1 cursor-pointer"
              >
                🏷️ Total Discounts
              </button>
              <button
                onClick={() => handleAskQuestion("How are discounts and item discounts shown on customer receipts?")}
                className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                🧾 Receipt Discounts
              </button>
              <button
                onClick={() => handleAskQuestion("What is today's sales revenue, profit, and order count?")}
                className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                📊 Today's Revenue
              </button>
              <button
                onClick={() => handleAskQuestion("Which is the cheapest item in store?")}
                className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                Cheapest item
              </button>
              <button
                onClick={() => handleAskQuestion("What is the most selling item?")}
                className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                🔥 Most selling item
              </button>
              <button
                onClick={() => handleAskQuestion("Show low stock and out of stock items")}
                className="px-2.5 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg border border-slate-200 hover:border-orange-200 whitespace-nowrap transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                ⚠️ Low stock alert
              </button>
            </>
          )}
        </div>
      )}

        {/* TAB 1: Chat View */}
        {mainTab === 'chat' && (
          <>
            {/* Message Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 custom-scrollbar">
              <div className={`mx-auto w-full space-y-4 ${isFullscreen ? 'max-w-4xl' : 'max-w-none'}`}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.sender === 'ai' && (
                    <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[88%] rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-orange-600 text-white rounded-tr-none'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-sm'
                    }`}
                  >
                    <FormattedMarkdownText text={msg.text} isUser={msg.sender === 'user'} />

                    {/* Interactive AI Product Editor Card */}
                    {msg.productEditDraft && (
                      <AiProductEditorCard
                        draft={msg.productEditDraft}
                        onSavedSuccess={(updatedProduct) => {
                          if (onProductUpdated) {
                            onProductUpdated(updatedProduct);
                          }
                        }}
                      />
                    )}

                    {/* Candidate Products to pick for editing */}
                    {msg.productCandidates && msg.productCandidates.length > 0 && (
                      <CandidateProductsList
                        products={msg.productCandidates}
                        onSelectProduct={handleSelectCandidateToEdit}
                        currencySymbol={store.currencySymbol || 'Rs.'}
                        onOpenFullCatalog={() => {
                          setMainTab('all_products');
                          setSelectedCatalogProduct(null);
                        }}
                      />
                    )}

                    {/* Parsed Products Action Button */}
                    {msg.parsedProducts && msg.parsedProducts.length > 0 && !msg.actionTaken && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCommitParsedProducts(msg.id, msg.parsedProducts!)}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Save All {msg.parsedProducts.length} Products to Inventory
                        </button>
                        {onOpenBatchRegister && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenBatchRegister();
                            }}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors text-center cursor-pointer"
                          >
                            Edit in Batch Table First
                          </button>
                        )}
                      </div>
                    )}

                    <div className={`text-[10px] mt-2 pt-1 border-t border-slate-100 flex items-center justify-between gap-2 ${msg.sender === 'user' ? 'text-orange-200' : 'text-slate-400'}`}>
                      <span>{msg.timestamp}</span>
                      {msg.sender === 'ai' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSpeakMessage(msg.id, msg.text)}
                            className="px-1.5 py-0.5 hover:text-slate-800 hover:bg-slate-100 rounded text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                            title={speakingMessageId === msg.id ? "Stop voice reading" : "Read message aloud"}
                          >
                            {speakingMessageId === msg.id ? (
                              <>
                                <VolumeX className="w-3.5 h-3.5 text-orange-600 animate-pulse" />
                                <span className="text-orange-600 font-bold">Stop</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>Listen</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, msg.text)}
                            className="px-1.5 py-0.5 hover:text-slate-800 hover:bg-slate-100 rounded text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                            title="Copy text to clipboard"
                          >
                            {copiedMessageId === msg.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-600 font-bold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {msg.sender === 'user' && (
                    <div className="w-8 h-8 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}

              {isProcessing && (
                <div className="flex items-center gap-2 text-slate-500 text-xs italic pl-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-600" />
                  <span>Analyzing store database & computing answer...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input & Excel Attachment Area */}
            <div className="p-3 sm:p-4 border-t border-slate-200 bg-white shrink-0">
              <div className={`mx-auto w-full ${isFullscreen ? 'max-w-4xl' : 'max-w-none'}`}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAskQuestion(input);
                }}
                className="flex items-center gap-2"
              >
                {/* Hidden File Input for Excel */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleChatExcelUpload}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingFile}
                  title="Upload Excel or CSV file for AI to automatically list products"
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 text-slate-600 hover:text-emerald-700 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold hidden sm:inline">Excel</span>
                </button>

                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask AI: 'Change price of Milk to 250', 'Add 20 stock to Rice', 'Edit product'..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-xs sm:text-sm bg-slate-50/50"
                />

                <button
                  type="submit"
                  disabled={!input.trim() || isProcessing}
                  className="p-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
              <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between px-1">
                <span>Ask AI to edit product prices, stock, names, or analyze store trends</span>
                <span className="font-mono">Mart Pro AI v2.5</span>
              </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: All Products in Store to Edit View */}
        {mainTab === 'all_products' && (
          <div className="flex-1 overflow-y-auto bg-slate-50/80 p-3 sm:p-5 flex flex-col gap-4 custom-scrollbar">
            <div className={`mx-auto w-full ${isFullscreen ? 'max-w-7xl' : 'max-w-none'} space-y-4`}>
              
              {/* Header & Controls Toolbar */}
              <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-orange-100 text-orange-700">
                        <Boxes className="w-5 h-5" />
                      </div>
                      <h4 className="font-black text-slate-900 text-sm sm:text-base tracking-tight">
                        All Products in Store ({products.length})
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                        Live Catalog
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      All products in store appear here to view and edit prices, wholesale costs, stock quantities, barcode, shortcut codes, and discounts.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onOpenBatchRegister && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenBatchRegister();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
                        <span>Batch Register</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMainTab('chat');
                        handleAskQuestion("Help me add a new product to store");
                      }}
                      className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add with AI</span>
                    </button>
                  </div>
                </div>

                {/* Search Bar & Sort */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                  <div className="relative md:col-span-8">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder="Search any product by name, #1001 shortcut code, barcode, or category..."
                      className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:border-orange-500 focus:bg-white focus:outline-none"
                    />
                    {catalogSearch && (
                      <button
                        type="button"
                        onClick={() => setCatalogSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className="md:col-span-4 flex items-center gap-2">
                    <select
                      value={catalogSort}
                      onChange={(e: any) => setCatalogSort(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:border-orange-500 focus:bg-white focus:outline-none font-medium cursor-pointer"
                    >
                      <option value="name_asc">Sort: Name (A - Z)</option>
                      <option value="price_desc">Sort: Price (High → Low)</option>
                      <option value="price_asc">Sort: Price (Low → High)</option>
                      <option value="stock_asc">Sort: Stock (Low → High)</option>
                      <option value="stock_desc">Sort: Stock (High → Low)</option>
                    </select>
                  </div>
                </div>

                {/* Stock Filter Chips & Category Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                  <button
                    type="button"
                    onClick={() => setCatalogStockFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                      catalogStockFilter === 'all'
                        ? 'bg-orange-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All Products ({products.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setCatalogStockFilter('low')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                      catalogStockFilter === 'low'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                    }`}
                  >
                    <span>⚠️ Low Stock</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10">
                      {storeMetrics.lowStockCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCatalogStockFilter('out')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                      catalogStockFilter === 'out'
                        ? 'bg-red-600 text-white shadow-2xs'
                        : 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-200'
                    }`}
                  >
                    <span>🚨 Out of Stock</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10">
                      {storeAnalytics.outOfStock.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCatalogStockFilter('discounted')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                      catalogStockFilter === 'discounted'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    <span>🏷️ On Discount</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10">
                      {storeMetrics.discountedProductsCount}
                    </span>
                  </button>

                  {allStoreCategories.length > 1 && (
                    <div className="flex items-center gap-1 ml-auto overflow-x-auto custom-scrollbar py-0.5">
                      <button
                        type="button"
                        onClick={() => setCatalogCategory('all')}
                        className={`px-2 py-0.5 rounded-md font-medium text-[11px] whitespace-nowrap cursor-pointer ${
                          catalogCategory === 'all'
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        All Categories
                      </button>
                      {allStoreCategories.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCatalogCategory(cat)}
                          className={`px-2 py-0.5 rounded-md font-medium text-[11px] whitespace-nowrap cursor-pointer ${
                            catalogCategory === cat
                              ? 'bg-slate-800 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Editing State or Product Catalog Display */}
              {selectedCatalogProduct ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedCatalogProduct(null)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back to All Products ({filteredCatalogProducts.length})</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium hidden sm:inline">Editing Product:</span>
                      <span className="font-extrabold text-xs sm:text-sm text-slate-900 bg-orange-50 px-2 py-1 rounded-lg border border-orange-200">
                        {selectedCatalogProduct.name}
                      </span>
                    </div>
                  </div>

                  {/* Responsive Split View on Large Screens or Full Editor */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Left Compact List on Large Screens */}
                    <div className="hidden lg:block lg:col-span-5 space-y-2 max-h-[650px] overflow-y-auto custom-scrollbar pr-1">
                      <div className="text-xs font-bold text-slate-700 px-1 mb-1">
                        Select Product to Switch ({filteredCatalogProducts.length})
                      </div>
                      {filteredCatalogProducts.map(p => {
                        const isSelected = p.id === selectedCatalogProduct.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedCatalogProduct(p)}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-orange-50 border-orange-500 shadow-xs'
                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-bold text-xs text-slate-900 truncate">{p.name}</span>
                              {p.shortcutCode && (
                                <span className="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                  #{p.shortcutCode}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                              <span>{store.currencySymbol || 'Rs.'} {(p.price || 0).toFixed(2)}</span>
                              <span className={`font-bold ${
                                (p.stockQuantity ?? 0) <= 0 ? 'text-red-600' : (p.stockQuantity ?? 0) <= (p.minStockLevel || 5) ? 'text-amber-600' : 'text-emerald-600'
                              }`}>
                                {p.stockQuantity} in stock
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right Editor Card */}
                    <div className="lg:col-span-7">
                      <AiProductEditorCard
                        draft={createEditDraft(selectedCatalogProduct)}
                        onSavedSuccess={(updated) => {
                          setSelectedCatalogProduct(updated);
                          if (onProductUpdated) {
                            onProductUpdated(updated);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Products Grid Display */
                <div className="space-y-3">
                  {filteredCatalogProducts.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
                      <Boxes className="w-10 h-10 text-slate-300 mx-auto" />
                      <div className="font-bold text-slate-700 text-sm">No products found</div>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        No products match your search "{catalogSearch}" or current filter. Try clearing filters or search term.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCatalogSearch('');
                          setCatalogCategory('all');
                          setCatalogStockFilter('all');
                        }}
                        className="mt-2 px-3 py-1.5 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 cursor-pointer"
                      >
                        Reset All Filters
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {filteredCatalogProducts.map(p => {
                        const isOutOfStock = (p.stockQuantity ?? 0) <= 0;
                        const isLowStock = !isOutOfStock && (p.stockQuantity ?? 0) <= (p.minStockLevel || 5);
                        const isDiscounted = Boolean(p.discountActive && (p.discountValue || 0) > 0);
                        const cost = Number(p.costPrice || 0);
                        const price = Number(p.price || 0);
                        const unitProfit = price - cost;
                        const marginPercent = price > 0 ? ((unitProfit / price) * 100).toFixed(0) : '0';

                        return (
                          <div
                            key={p.id}
                            className="bg-white rounded-2xl border border-slate-200 hover:border-orange-300 hover:shadow-md transition-all p-3.5 flex flex-col justify-between gap-3 group"
                          >
                            <div className="space-y-2">
                              {/* Header: Name & Shortcut */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <h5 className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight line-clamp-2 group-hover:text-orange-700 transition-colors" title={p.name}>
                                    {p.name}
                                  </h5>
                                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 font-medium truncate max-w-[120px]">
                                      {p.category || 'General'}
                                    </span>
                                    {p.sellBy === 'weight' && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px] flex items-center gap-0.5">
                                        <Scale className="w-2.5 h-2.5" />
                                        <span>/{p.unitType || 'kg'}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {p.shortcutCode && (
                                  <span className="px-2 py-1 rounded-lg bg-orange-50 border border-orange-200 font-mono text-xs font-black text-orange-800 shrink-0 shadow-2xs" title="POS 4-Digit Shortcut Code">
                                    #{p.shortcutCode}
                                  </span>
                                )}
                              </div>

                              {/* Barcode */}
                              {p.barcode && (
                                <div className="text-[10px] font-mono text-slate-400 truncate">
                                  Barcode: {p.barcode}
                                </div>
                              )}

                              {/* Pricing & Cost */}
                              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                                <div>
                                  <div className="text-[10px] text-slate-400 font-bold uppercase">Selling Price</div>
                                  <div className="font-black text-slate-900 text-sm">
                                    {store.currencySymbol || 'Rs.'} {price.toFixed(2)}
                                  </div>
                                </div>

                                {isDiscounted ? (
                                  <div className="text-right">
                                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">
                                      🏷️ {p.discountValue}% OFF
                                    </span>
                                    <div className="text-[10px] text-emerald-700 font-bold">
                                      {store.currencySymbol || 'Rs.'} {(price - (price * (p.discountValue || 0) / 100)).toFixed(2)}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-right">
                                    <div className="text-[10px] text-slate-400 font-medium">Cost: {store.currencySymbol || 'Rs.'} {cost.toFixed(2)}</div>
                                    <div className="text-[10px] text-emerald-600 font-bold">Margin: +{marginPercent}%</div>
                                  </div>
                                )}
                              </div>

                              {/* Stock Health & Quick Stepper */}
                              <div className="flex items-center justify-between text-xs pt-1">
                                <div className={`font-bold flex items-center gap-1 ${
                                  isOutOfStock ? 'text-red-600' : isLowStock ? 'text-amber-600' : 'text-emerald-600'
                                }`}>
                                  <span className={`w-2 h-2 rounded-full ${
                                    isOutOfStock ? 'bg-red-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`} />
                                  <span className="text-[11px]">
                                    {isOutOfStock ? 'Out of stock' : isLowStock ? `Low: ${p.stockQuantity} left` : `${p.stockQuantity} in stock`}
                                  </span>
                                </div>

                                {/* Quick inline stock stepper */}
                                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-slate-700 text-[11px] font-bold">
                                  <button
                                    type="button"
                                    onClick={() => handleQuickStockUpdate(p, -1)}
                                    title="Decrease stock by 1"
                                    className="w-5 h-5 flex items-center justify-center hover:bg-white rounded text-slate-600 hover:text-slate-900 cursor-pointer transition-colors"
                                  >
                                    -1
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickStockUpdate(p, 1)}
                                    title="Increase stock by 1"
                                    className="w-5 h-5 flex items-center justify-center hover:bg-white rounded text-slate-600 hover:text-slate-900 cursor-pointer transition-colors"
                                  >
                                    +1
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickStockUpdate(p, 5)}
                                    title="Increase stock by 5"
                                    className="px-1 h-5 flex items-center justify-center hover:bg-white rounded text-slate-600 hover:text-slate-900 text-[10px] cursor-pointer transition-colors"
                                  >
                                    +5
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Card Footer Actions */}
                            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedCatalogProduct(p)}
                                className="flex-1 py-1.5 px-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit Product</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setMainTab('chat');
                                  handleAskQuestion(`Tell me about ${p.name}: what is its selling price, wholesale cost, stock status, and sales performance?`);
                                }}
                                title="Ask AI about this product"
                                className="p-1.5 rounded-xl border border-slate-200 hover:border-orange-200 bg-slate-50 hover:bg-orange-50 text-slate-600 hover:text-orange-700 transition-colors cursor-pointer shrink-0"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
};
