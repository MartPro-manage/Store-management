import React, { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { 
  Barcode as BarcodeIcon, 
  Printer, 
  X, 
  Sparkles, 
  Copy, 
  Check, 
  Layers, 
  PlusCircle, 
  Scale, 
  Coins, 
  Tag, 
  RefreshCw,
  Sliders,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  Grid,
  CheckCheck,
  AlignJustify,
  MoveVertical,
  MoveHorizontal,
  Columns,
  Rows
} from 'lucide-react';
import { Product, Store } from '../types';
import { downloadStickerLabel } from '../lib/barcodeDownload';

interface BarcodeGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store;
  initialProduct?: Partial<Product> | null;
  onSaveToInventory?: (productData: {
    name: string;
    uniqueNumber: string;
    weight: string;
    costPrice?: number;
    price: number;
    category?: string;
    stockQuantity?: number;
  }) => Promise<void>;
}

export const BarcodeGeneratorModal: React.FC<BarcodeGeneratorModalProps> = ({
  isOpen,
  onClose,
  store,
  initialProduct,
  onSaveToInventory
}) => {
  const [productName, setProductName] = useState('');
  const [uniqueNumber, setUniqueNumber] = useState('');
  const [weight, setWeight] = useState('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  const [category, setCategory] = useState('General');
  const [stockQuantity, setStockQuantity] = useState<number | ''>(50);
  
  const [barcodeFormat, setBarcodeFormat] = useState<'CODE128' | 'EAN13' | 'UPC' | 'pharmacode'>('CODE128');
  const [labelCopies, setLabelCopies] = useState<number>(6);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [isGenerated, setIsGenerated] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Line Orientation: 'vertical' (default) vs 'horizontal'
  const [lineOrientation, setLineOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  // Sticker Pattern selection: 'single' (single line) or 'multiple' (multiple lines)
  const [stickerPattern, setStickerPattern] = useState<'single' | 'multiple'>('multiple');
  const [singleLineCount, setSingleLineCount] = useState<number>(1);
  const [linesCount, setLinesCount] = useState<number>(3); // number of vertical/horizontal lines (e.g. 2, 3, 4)
  const [stickersPerLine, setStickersPerLine] = useState<number>(3); // stickers per line
  const [stickerCount, setStickerCount] = useState<number>(6);

  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);

  // Initialize form when opening with initial product or defaults
  useEffect(() => {
    if (isOpen) {
      if (initialProduct) {
        setProductName(initialProduct.name || '');
        setUniqueNumber(initialProduct.barcode || initialProduct.serialNumber || generateUniqueId());
        setWeight(initialProduct.weight || '');
        setCostPrice(initialProduct.costPrice ?? '');
        setPrice(initialProduct.price ?? '');
        setCategory(initialProduct.category || 'General');
        setStockQuantity(initialProduct.stockQuantity || 50);
      } else {
        setProductName('');
        setUniqueNumber(generateUniqueId());
        setWeight('500g');
        setCostPrice('');
        setPrice('');
        setCategory('General');
        setStockQuantity(50);
      }
      setSaveSuccess(false);
      setBarcodeError(null);
      setIsGenerated(false);
    }
  }, [isOpen, initialProduct]);

  // Function to generate a clean full numeric barcode
  function generateUniqueId() {
    return '890' + Math.floor(100000000 + Math.random() * 900000000).toString();
  }

  const handleGenerateRandomCode = () => {
    const newCode = generateUniqueId();
    setUniqueNumber(newCode);
    renderBarcode(newCode);
  };

  const renderBarcode = (codeToRender: string) => {
    const code = codeToRender.trim();
    if (!code) {
      setBarcodeError('Please provide a unique code or number.');
      setIsGenerated(false);
      return;
    }

    try {
      if (barcodeSvgRef.current) {
        JsBarcode(barcodeSvgRef.current, code, {
          format: barcodeFormat,
          lineColor: '#000000',
          width: 2,
          height: 48,
          displayValue: true,
          font: 'monospace',
          fontSize: 14,
          fontOptions: 'bold',
          textMargin: 3,
          margin: 6
        });
        setBarcodeError(null);
        setIsGenerated(true);
      }
    } catch (err: any) {
      console.warn('Barcode render error:', err);
      // Fallback to standard CODE128 if format failed
      try {
        if (barcodeSvgRef.current) {
          JsBarcode(barcodeSvgRef.current, code, {
            format: 'CODE128',
            lineColor: '#000000',
            width: 2,
            height: 48,
            displayValue: true,
            font: 'monospace',
            fontSize: 14,
            fontOptions: 'bold',
            textMargin: 3,
            margin: 6
          });
          setBarcodeError(null);
          setIsGenerated(true);
        }
      } catch (fallbackErr: any) {
        setBarcodeError('Invalid barcode format for this number. Try numbers/letters for CODE128.');
        setIsGenerated(false);
      }
    }
  };

  // Re-render barcode whenever uniqueNumber or format changes
  useEffect(() => {
    if (uniqueNumber.trim()) {
      renderBarcode(uniqueNumber);
    }
  }, [uniqueNumber, barcodeFormat]);

  const handleGenerateClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      setBarcodeError('Please enter product name.');
      return;
    }
    if (!uniqueNumber.trim()) {
      setBarcodeError('Please enter or generate a unique number.');
      return;
    }
    renderBarcode(uniqueNumber);
  };

  const handlePrintLabels = () => {
    const storeName = store?.name || 'SUPERMARKET';
    const numPrice = typeof price === 'number' ? price : parseFloat(price as any) || 0;
    const formattedPrice = `Rs. ${numPrice.toFixed(2)}`;
    const weightStr = weight.trim() ? weight.trim() : 'Standard';

    // Get SVG data
    let svgContent = '';
    if (barcodeSvgRef.current) {
      const serializer = new XMLSerializer();
      svgContent = serializer.serializeToString(barcodeSvgRef.current);
    }

    const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Barcode Labels - ${productName}</title>
          <style>
            @page {
              size: A4;
              margin: 10mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              margin: 0;
              padding: 0;
              color: #000;
              background: #fff;
            }
            .sheet-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 8mm;
              justify-content: center;
            }
            .label-card {
              border: 1px dashed #888;
              border-radius: 4px;
              padding: 6px;
              text-align: center;
              page-break-inside: avoid;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              background: #fff;
              box-sizing: border-box;
              height: 42mm;
            }
            .store-header {
              font-size: 9px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #444;
              margin-bottom: 2px;
            }
            .product-title {
              font-size: 11px;
              font-weight: bold;
              line-height: 1.2;
              max-width: 95%;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              margin-bottom: 2px;
            }
            .barcode-wrap svg {
              max-width: 100%;
              height: 38px;
              display: block;
              margin: 0 auto;
            }
            .label-footer {
              display: flex;
              justify-content: space-between;
              width: 92%;
              margin-top: 3px;
              font-size: 10px;
              font-weight: 800;
              border-top: 1px solid #ddd;
              padding-top: 3px;
            }
            .weight-tag {
              color: #444;
            }
            .price-tag {
              color: #000;
              font-size: 11px;
            }
          </style>
        </head>
        <body>
          <div class="sheet-grid">
            ${Array.from({ length: labelCopies }).map(() => `
              <div class="label-card">
                <div class="store-header">${storeName}</div>
                <div class="product-title">${productName || 'PRODUCT'}</div>
                <div class="barcode-wrap">
                  ${svgContent}
                </div>
                <div class="label-footer">
                  <span class="weight-tag">Wt: ${weightStr}</span>
                  <span class="price-tag">${formattedPrice}</span>
                </div>
              </div>
            `).join('')}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 250);
            };
          </script>
        </body>
      </html>
    `;

    try {
      const printWin = window.open('', '_blank', 'width=750,height=800');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(printHtml);
        printWin.document.close();
        printWin.focus();
        return;
      }
    } catch (e) {
      console.warn('Popup print blocked:', e);
    }
    window.print();
  };

  // Download complete physical Retail Label Sticker (PNG) with Vertical or Horizontal Line Pattern
  const handleDownloadStickerLabel = async () => {
    if (!uniqueNumber.trim()) {
      setBarcodeError('Please generate a barcode first.');
      return;
    }
    const numPrice = typeof price === 'number' ? price : parseFloat(price as any) || 0;
    
    setIsDownloading(true);
    try {
      await downloadStickerLabel({
        storeName: store?.name || 'SUPERMARKET',
        productName: productName.trim() || 'PRODUCT',
        uniqueCode: uniqueNumber.trim(),
        weight: weight.trim() || 'Standard',
        price: numPrice,
        format: barcodeFormat,
        orientation: lineOrientation,
        pattern: stickerPattern,
        singleLineCount: stickerPattern === 'single' ? singleLineCount : 1,
        linesCount,
        stickersPerLine,
        labelCount: stickerPattern === 'single' ? singleLineCount : stickerCount
      });
      const patternText = lineOrientation === 'vertical'
        ? (stickerPattern === 'single'
            ? `Single Vertical Line (${singleLineCount} ${singleLineCount === 1 ? 'Sticker' : 'Stickers'})`
            : `Multiple Vertical Lines (${linesCount} lines, ${stickersPerLine} per line - fills vertical line 1 then line 2)`)
        : (stickerPattern === 'single'
            ? `Single Horizontal Line (${singleLineCount} ${singleLineCount === 1 ? 'Sticker' : 'Stickers'})`
            : `Multiple Horizontal Lines (${stickerCount} Stickers, ${stickersPerLine} per line)`);

      setDownloadSuccessMessage(`Downloaded Barcode as Sticker Label (${patternText})`);
      setTimeout(() => setDownloadSuccessMessage(null), 4000);
    } catch (err: any) {
      setBarcodeError('Failed to download Sticker PNG: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSaveToStock = async () => {
    if (!productName.trim()) {
      setBarcodeError('Product Name is required to save.');
      return;
    }
    if (!uniqueNumber.trim()) {
      setBarcodeError('Unique Number is required to save.');
      return;
    }
    const numPrice = typeof price === 'number' ? price : parseFloat(price as any) || 0;
    if (isNaN(numPrice) || numPrice < 0) {
      setBarcodeError('Please enter a valid price.');
      return;
    }
    const numCostPrice = typeof costPrice === 'number' ? costPrice : (costPrice !== '' ? parseFloat(costPrice as any) : undefined);

    if (onSaveToInventory) {
      setIsSaving(true);
      try {
        await onSaveToInventory({
          name: productName.trim(),
          uniqueNumber: uniqueNumber.trim(),
          weight: weight.trim() || 'Standard',
          costPrice: numCostPrice !== undefined && !isNaN(numCostPrice) ? numCostPrice : undefined,
          price: numPrice,
          category: category.trim() || 'General',
          stockQuantity: typeof stockQuantity === 'number' ? stockQuantity : parseInt(stockQuantity as string, 10) || 50
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } catch (err: any) {
        setBarcodeError('Failed to save to stock: ' + err.message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-fade-in my-auto">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-600/20 text-orange-400 rounded-2xl border border-orange-500/30">
              <BarcodeIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white">
                  Barcode Label Generator & Print Station
                </h2>
                <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold">
                  Pakistani Rupees (PKR)
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Create custom product barcodes with Name, Unique Number, Weight & Price (Rs.)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto overscroll-contain custom-scrollbar space-y-6 flex-1 bg-slate-50/50">
          
          {barcodeError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 flex items-center gap-2">
              <X className="w-4 h-4 text-red-500 shrink-0" />
              <span>{barcodeError}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Product barcode successfully registered & updated in Store Stock Inventory!</span>
            </div>
          )}

          {downloadSuccessMessage && (
            <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-2xl text-xs font-bold text-sky-800 flex items-center gap-2 animate-fade-in">
              <Download className="w-4 h-4 text-sky-600 shrink-0 animate-bounce" />
              <span>{downloadSuccessMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: Input Parameters */}
            <form onSubmit={handleGenerateClick} className="lg:col-span-6 space-y-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              
              <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                  1. Product Specifications
                </span>
                <span className="text-[10px] text-slate-500 font-bold">Step 1</span>
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Product Name *
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Basmati Rice 1kg, Milk Pack"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:outline-none focus:border-orange-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Unique Number / Barcode Code */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Unique Number / Barcode *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomCode}
                    className="text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer bg-orange-50 px-2 py-0.5 rounded border border-orange-200"
                  >
                    <RefreshCw className="w-3 h-3" /> Auto-Generate
                  </button>
                </div>
                <div className="relative">
                  <BarcodeIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    maxLength={50}
                    required
                    placeholder="e.g. 890123456789 (Full Barcode)"
                    value={uniqueNumber}
                    onChange={(e) => {
                      setUniqueNumber(e.target.value.trim());
                    }}
                    className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-mono font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Weight, Cost Price & Selling Price (PKR) Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Weight / Volume *
                  </label>
                  <div className="relative">
                    <Scale className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. 500g, 1kg, 250ml"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition-all text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Cost Price (Rs.)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Buy rate</span>
                  </label>
                  <div className="relative">
                    <span className="text-[11px] font-black text-slate-500 absolute left-3 top-1/2 -translate-y-1/2">
                      Rs.
                    </span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="e.g. 180.00"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition-all text-slate-800 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Selling Price (Rs.) *</span>
                    <span className="text-[10px] text-orange-600 font-bold">Retail rate</span>
                  </label>
                  <div className="relative">
                    <span className="text-[11px] font-black text-slate-500 absolute left-3 top-1/2 -translate-y-1/2">
                      Rs.
                    </span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      placeholder="250.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-black focus:outline-none focus:border-orange-500 focus:bg-white transition-all text-orange-600 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Estimated Profit Indicator in Barcode Generator */}
              {typeof price === 'number' && price > 0 && typeof costPrice === 'number' && costPrice >= 0 && (
                <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-200 flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Estimated Gross Profit:</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-black ${price >= costPrice ? 'text-emerald-700' : 'text-red-600'}`}>
                      Rs. {(price - costPrice).toFixed(2)} / unit
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      price > costPrice 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                        : price === costPrice 
                          ? 'bg-slate-100 text-slate-700' 
                          : 'bg-red-100 text-red-800 border border-red-300'
                    }`}>
                      {price > 0 ? `${(((price - costPrice) / price) * 100).toFixed(1)}% margin` : '0%'}
                    </span>
                  </div>
                </div>
              )}

              {/* Initial Stock & Category (For quick inventory save) */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Stock Units
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="50"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    placeholder="General"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Barcode Encoding Selection */}
              <div className="pt-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Barcode Symbology
                </label>
                <div className="flex gap-2">
                  {(['CODE128', 'EAN13', 'UPC'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setBarcodeFormat(fmt)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold cursor-pointer transition-all ${
                        barcodeFormat === fmt
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all mt-2"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                Generate / Refresh Barcode
              </button>

            </form>

            {/* Right: Live Sticker Preview & Print Controls */}
            <div className="lg:col-span-6 space-y-4 flex flex-col">
              
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex-1 flex flex-col">
                <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                    2. Live Barcode Label Preview
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Print Ready
                  </span>
                </div>

                {/* THE PHYSICAL LABEL CARD PREVIEW */}
                <div className="p-6 bg-gradient-to-b from-slate-50 to-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center my-auto shadow-inner">
                  <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-md w-full max-w-[280px] text-center space-y-1.5 transition-all">
                    
                    {/* Store Title */}
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {store?.name || 'SUPERMARKET'}
                    </div>

                    {/* Product Name */}
                    <div className="text-xs font-extrabold text-slate-900 truncate px-1">
                      {productName.trim() || 'PRODUCT NAME'}
                    </div>

                    {/* Rendered SVG Barcode */}
                    <div className="py-1 flex justify-center overflow-hidden">
                      <svg ref={barcodeSvgRef} className="max-w-full h-auto mx-auto"></svg>
                    </div>

                    {/* Footer: Weight & Pakistani Rupees Price */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 text-xs font-bold px-1">
                      <span className="text-slate-600 text-[11px] font-mono">
                        Wt: <span className="text-slate-900 font-bold">{weight.trim() || '500g'}</span>
                      </span>
                      <span className="text-orange-700 font-black text-sm font-mono">
                        Rs. {(typeof price === 'number' ? price : parseFloat(price as any) || 0).toFixed(2)}
                      </span>
                    </div>

                  </div>

                  <p className="text-[11px] text-slate-500 font-medium mt-3 text-center">
                    Scannable by all USB barcode guns, Bluetooth scanners, and smartphone cameras.
                  </p>
                </div>

                {/* DOWNLOAD BARCODE AS STICKER LABEL (Vertical & Horizontal Lines Pattern) */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-orange-600" /> Download Barcode as Sticker Label
                    </span>
                    <span className="text-[10px] bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded-full border border-orange-200">
                      Sticker Format
                    </span>
                  </div>

                  {/* 1. Line Orientation: Vertical Lines vs Horizontal Lines */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                      Line Orientation
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setLineOrientation('vertical')}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                          lineOrientation === 'vertical'
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <MoveVertical className="w-3.5 h-3.5 text-orange-400" />
                        <span>Vertical Lines (Columns)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLineOrientation('horizontal')}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                          lineOrientation === 'horizontal'
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <MoveHorizontal className="w-3.5 h-3.5 text-sky-400" />
                        <span>Horizontal Lines (Rows)</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Pattern Selection: Single Line vs Multiple Lines */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                      Select Pattern
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setStickerPattern('single')}
                        className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                          stickerPattern === 'single'
                            ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <AlignJustify className="w-3.5 h-3.5" />
                        <span>Single {lineOrientation === 'vertical' ? 'Vertical' : 'Horizontal'} Line</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStickerPattern('multiple')}
                        className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                          stickerPattern === 'multiple'
                            ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <Grid className="w-3.5 h-3.5" />
                        <span>Multiple {lineOrientation === 'vertical' ? 'Vertical' : 'Horizontal'} Lines</span>
                      </button>
                    </div>
                  </div>

                  {/* Single Line Pattern Options */}
                  {stickerPattern === 'single' && (
                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700">
                          {lineOrientation === 'vertical' ? 'Stickers in Vertical Column:' : 'Stickers in Horizontal Row:'}
                        </span>
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5, 6].map((cnt) => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => setSingleLineCount(cnt)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                singleLineCount === cnt
                                  ? 'bg-orange-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {cnt}
                            </button>
                          ))}
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 font-medium bg-slate-50 p-2 rounded-lg border border-slate-200 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                        <span>
                          {lineOrientation === 'vertical'
                            ? `Generates ${singleLineCount} sticker ${singleLineCount === 1 ? 'label' : 'labels'} stacked vertically top-to-bottom in 1 vertical column strip.`
                            : `Generates ${singleLineCount} sticker ${singleLineCount === 1 ? 'label' : 'labels'} side-by-side in 1 horizontal row strip.`
                          }
                        </span>
                      </p>
                    </div>
                  )}

                  {/* Multiple Lines Pattern Options */}
                  {stickerPattern === 'multiple' && (
                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-3 animate-fade-in">
                      {lineOrientation === 'vertical' ? (
                        <>
                          {/* Number of Vertical Lines */}
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700">Number of Vertical Lines:</span>
                            <div className="flex gap-1">
                              {[2, 3, 4].map((lines) => (
                                <button
                                  key={lines}
                                  type="button"
                                  onClick={() => setLinesCount(lines)}
                                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                    linesCount === lines
                                      ? 'bg-slate-900 text-white'
                                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  }`}
                                >
                                  {lines} vertical lines
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Stickers down each Vertical Line */}
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700">Stickers Down Each Line:</span>
                            <div className="flex gap-1">
                              {[2, 3, 4, 5, 6].map((stk) => (
                                <button
                                  key={stk}
                                  type="button"
                                  onClick={() => setStickersPerLine(stk)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                    stickersPerLine === stk
                                      ? 'bg-orange-600 text-white'
                                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  }`}
                                >
                                  {stk} / line
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="text-[10px] text-slate-600 font-semibold bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg flex items-start gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-emerald-800">Vertical Sequential Fill:</strong>
                              <div className="text-slate-600 font-normal">
                                First fills <strong>Vertical Line 1 (top to bottom: {stickersPerLine} stickers)</strong>, then moves right to fill <strong>Vertical Line 2 (top to bottom)</strong>, then <strong>Vertical Line 3</strong>. (Total {linesCount * stickersPerLine} stickers)
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Horizontal Lines Options */}
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700">Stickers Per Horizontal Line:</span>
                            <div className="flex gap-1">
                              {[2, 3, 4].map((cols) => (
                                <button
                                  key={cols}
                                  type="button"
                                  onClick={() => setStickersPerLine(cols)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                    stickersPerLine === cols
                                      ? 'bg-slate-900 text-white'
                                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  }`}
                                >
                                  {cols} / line
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700">Total Labels:</span>
                            <div className="flex gap-1">
                              {[4, 6, 8, 12, 18, 24].map((cnt) => (
                                <button
                                  key={cnt}
                                  type="button"
                                  onClick={() => setStickerCount(cnt)}
                                  className={`px-2 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                    stickerCount === cnt
                                      ? 'bg-orange-600 text-white'
                                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  }`}
                                >
                                  {cnt}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="text-[10px] text-slate-600 font-semibold bg-sky-50 border border-sky-200 p-2.5 rounded-lg flex items-start gap-2">
                            <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-sky-800">Horizontal Sequential Fill:</strong>
                              <div className="text-slate-600 font-normal">
                                First fills <strong>Horizontal Line 1 across (left to right: {stickersPerLine} stickers)</strong>, then moves down to fill <strong>Horizontal Line 2 across</strong>, then Line 3.
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Primary Download Button */}
                  <button
                    type="button"
                    onClick={handleDownloadStickerLabel}
                    disabled={isDownloading || !uniqueNumber.trim()}
                    className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generating Sticker Label...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download Barcode as Sticker Label ({lineOrientation === 'vertical' ? 'Vertical' : 'Horizontal'} {stickerPattern === 'multiple' ? 'Multi-Line' : 'Single Line'})
                      </>
                    )}
                  </button>
                </div>

                {/* Label Print Options */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Print Quantity (Stickers)
                    </label>
                    <div className="flex gap-1.5">
                      {[1, 6, 12, 24].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setLabelCopies(num)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                            labelCopies === num
                              ? 'bg-orange-600 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handlePrintLabels}
                      disabled={!productName.trim() || !uniqueNumber.trim()}
                      className="py-3 px-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20 cursor-pointer transition-all"
                    >
                      <Printer className="w-4 h-4" />
                      Print {labelCopies} Label{labelCopies > 1 ? 's' : ''}
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveToStock}
                      disabled={isSaving || !productName.trim() || !uniqueNumber.trim()}
                      className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer transition-all"
                    >
                      {isSaving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <PlusCircle className="w-4 h-4" />
                          Save to Stock
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium shrink-0">
          <span>Barcode Standard: {barcodeFormat} • Currency: Pakistani Rupee (Rs.)</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer transition-colors"
          >
            Close Generator
          </button>
        </div>

      </div>
    </div>
  );
};
