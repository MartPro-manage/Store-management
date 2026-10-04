import JsBarcode from 'jsbarcode';
import { Product } from '../types';

export interface StickerDownloadOptions {
  storeName: string;
  productName: string;
  uniqueCode: string;
  weight: string;
  price: number;
  format?: string;
  orientation?: 'vertical' | 'horizontal'; // Vertical line vs Horizontal line
  pattern?: 'single' | 'multiple'; // Single Line vs Multiple Lines
  singleLineCount?: number; // Stickers in 1 single line
  linesCount?: number; // Number of lines (e.g. 2, 3, or 4 vertical/horizontal lines)
  stickersPerLine?: number; // Number of stickers per line (e.g. 3, 4, 5, 6)
  labelCount?: number; // Total number of stickers
}

/**
 * Creates an in-memory barcode image from code
 */
function createBarcodeImage(uniqueCode: string, format: string = 'CODE128'): Promise<{ img: HTMLImageElement; cleanup: () => void }> {
  return new Promise((resolve, reject) => {
    try {
      const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      try {
        JsBarcode(tempSvg, uniqueCode, {
          format: format as any,
          lineColor: '#000000',
          width: 2,
          height: 48,
          displayValue: true,
          font: 'monospace',
          fontSize: 14,
          fontOptions: 'bold',
          textMargin: 3,
          margin: 4
        });
      } catch {
        JsBarcode(tempSvg, uniqueCode, {
          format: 'CODE128',
          lineColor: '#000000',
          width: 2,
          height: 48,
          displayValue: true,
          font: 'monospace',
          fontSize: 14,
          fontOptions: 'bold',
          textMargin: 3,
          margin: 4
        });
      }

      const serializer = new XMLSerializer();
      let svgStr = serializer.serializeToString(tempSvg);
      if (!svgStr.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        svgStr = svgStr.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const blobURL = URL.createObjectURL(svgBlob);

      const barcodeImg = new Image();
      barcodeImg.onload = () => {
        resolve({
          img: barcodeImg,
          cleanup: () => URL.revokeObjectURL(blobURL)
        });
      };
      barcodeImg.onerror = (err) => {
        URL.revokeObjectURL(blobURL);
        reject(err);
      };
      barcodeImg.src = blobURL;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Draws a single retail price sticker badge onto a target canvas at (startX, startY)
 */
function drawSingleStickerBadge(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  stickerWidth: number,
  stickerHeight: number,
  barcodeImg: HTMLImageElement,
  options: {
    storeName: string;
    productName: string;
    weight: string;
    price: number;
  }
) {
  const { storeName, productName, weight, price } = options;

  // Background card with border
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(startX, startY, stickerWidth, stickerHeight);

  // Outer border with subtle rounding or crisp line
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#94a3b8';
  ctx.strokeRect(startX + 4, startY + 4, stickerWidth - 8, stickerHeight - 8);

  // Store Header
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((storeName || 'SUPERMARKET').toUpperCase(), startX + stickerWidth / 2, startY + 28);

  // Product Name
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  let displayTitle = productName || 'PRODUCT';
  if (displayTitle.length > 28) {
    displayTitle = displayTitle.substring(0, 26) + '...';
  }
  ctx.fillText(displayTitle, startX + stickerWidth / 2, startY + 54);

  // Horizontal divider 1
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(startX + 16, startY + 66);
  ctx.lineTo(startX + stickerWidth - 16, startY + 66);
  ctx.stroke();

  // Barcode Image
  const barcodeMaxW = stickerWidth - 40;
  const barcodeDrawW = Math.min(barcodeImg.width * 1.3, barcodeMaxW);
  const barcodeDrawH = Math.min(barcodeImg.height * 1.3, 85);
  const barcodeX = startX + (stickerWidth - barcodeDrawW) / 2;
  const barcodeY = startY + 76;
  ctx.drawImage(barcodeImg, barcodeX, barcodeY, barcodeDrawW, barcodeDrawH);

  // Horizontal divider 2
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(startX + 12, startY + 180);
  ctx.lineTo(startX + stickerWidth - 12, startY + 180);
  ctx.stroke();

  // Weight
  ctx.textAlign = 'left';
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
  ctx.fillText(`Wt: ${weight || 'Standard'}`, startX + 18, startY + 208);

  // Price (PKR)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ea580c'; // Orange-600
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
  ctx.fillText(`Rs. ${price.toFixed(2)}`, startX + stickerWidth - 18, startY + 208);
}

/**
 * Downloads a Sticker Label Sheet:
 * - Single Line: 1 vertical column strip (or 1 horizontal row)
 * - Multiple Lines:
 *    * If Vertical: First fills vertical line 1 (top to bottom), then fills vertical line 2 (top to bottom), etc.
 *    * If Horizontal: First fills horizontal line 1 (left to right), then horizontal line 2 (left to right), etc.
 */
export async function downloadStickerLabel(options: StickerDownloadOptions): Promise<void> {
  const {
    storeName,
    productName,
    uniqueCode,
    weight,
    price,
    format = 'CODE128',
    orientation = 'vertical', // default vertical
    pattern = 'single',
    singleLineCount = 1,
    linesCount = 3,
    stickersPerLine = 3,
    labelCount = 6
  } = options;

  const { img: barcodeImg, cleanup } = await createBarcodeImage(uniqueCode, format);

  try {
    const stickerWidth = 420;
    const stickerHeight = 230;
    const padding = 20;

    let canvasWidth = 0;
    let canvasHeight = 0;
    let totalCols = 1;
    let totalRows = 1;
    let count = 1;

    if (orientation === 'vertical') {
      // VERTICAL LINE ORIENTATION
      if (pattern === 'single') {
        // Single Vertical Line (1 column with 1 or more stickers stacked vertically)
        totalCols = 1;
        totalRows = Math.max(1, Math.min(singleLineCount || 1, 6));
        count = totalRows;
      } else {
        // Multiple Vertical Lines
        // linesCount = number of vertical columns (e.g. 2, 3, or 4 columns)
        // stickersPerLine = number of stickers down each vertical line (e.g. 2, 3, 4, 5)
        const numCols = Math.max(1, Math.min(linesCount || 3, 4));
        const numRows = Math.max(1, Math.min(stickersPerLine || Math.ceil(labelCount / numCols), 8));
        
        totalCols = numCols;
        totalRows = numRows;
        count = Math.min(labelCount || (totalCols * totalRows), totalCols * totalRows);
      }

      canvasWidth = totalCols * stickerWidth + (totalCols + 1) * padding;
      canvasHeight = totalRows * stickerHeight + (totalRows + 1) * padding;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas 2D context not available');
      }

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // SEQUENTIAL FILL FOR VERTICAL LINES:
      // First fills Line 1 top-to-bottom (col 0, row 0..totalRows-1),
      // then fills Line 2 top-to-bottom (col 1, row 0..totalRows-1), etc.
      for (let index = 0; index < count; index++) {
        const col = Math.floor(index / totalRows);
        const row = index % totalRows;

        const posX = padding + col * (stickerWidth + padding);
        const posY = padding + row * (stickerHeight + padding);

        drawSingleStickerBadge(ctx, posX, posY, stickerWidth, stickerHeight, barcodeImg, {
          storeName,
          productName,
          weight,
          price
        });
      }

      const safeName = (productName || 'product').replace(/[^a-zA-Z0-9_-]/g, '_');
      const patternSuffix = pattern === 'single'
        ? `single_vertical_line_${count}x`
        : `multi_vertical_lines_${count}x`;
      const fileName = `${safeName}_sticker_${patternSuffix}_${uniqueCode}.png`;

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } else {
      // HORIZONTAL LINE ORIENTATION
      if (pattern === 'single') {
        // Single Horizontal Line (1 row with 1 or more stickers side-by-side horizontally)
        totalCols = Math.max(1, Math.min(singleLineCount || 1, 4));
        totalRows = 1;
        count = totalCols;
      } else {
        // Multiple Horizontal Lines
        const numCols = Math.max(1, Math.min(stickersPerLine || 3, 4));
        count = Math.max(1, labelCount || 6);
        totalCols = numCols;
        totalRows = Math.ceil(count / totalCols);
      }

      canvasWidth = totalCols * stickerWidth + (totalCols + 1) * padding;
      canvasHeight = totalRows * stickerHeight + (totalRows + 1) * padding;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas 2D context not available');
      }

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // SEQUENTIAL FILL FOR HORIZONTAL LINES:
      // First fills Line 1 left-to-right (row 0, col 0..totalCols-1),
      // then fills Line 2 left-to-right (row 1, col 0..totalCols-1), etc.
      for (let index = 0; index < count; index++) {
        const row = Math.floor(index / totalCols);
        const col = index % totalCols;

        const posX = padding + col * (stickerWidth + padding);
        const posY = padding + row * (stickerHeight + padding);

        drawSingleStickerBadge(ctx, posX, posY, stickerWidth, stickerHeight, barcodeImg, {
          storeName,
          productName,
          weight,
          price
        });
      }

      const safeName = (productName || 'product').replace(/[^a-zA-Z0-9_-]/g, '_');
      const patternSuffix = pattern === 'single'
        ? `single_horizontal_line_${count}x`
        : `multi_horizontal_lines_${count}x`;
      const fileName = `${safeName}_sticker_${patternSuffix}_${uniqueCode}.png`;

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } finally {
    cleanup();
  }
}

/**
 * Quick helper to download barcode sticker label for an existing Product object
 */
export async function downloadBarcodeForProduct(
  product: Product,
  storeName: string,
  orientation: 'vertical' | 'horizontal' = 'vertical',
  pattern: 'single' | 'multiple' = 'single',
  singleLineCount: number = 1,
  linesCount: number = 2,
  stickersPerLine: number = 3,
  labelCount: number = 6
) {
  const code = product.barcode || product.serialNumber || product.id;
  await downloadStickerLabel({
    storeName,
    productName: product.name,
    uniqueCode: code,
    weight: product.weight || 'Standard',
    price: product.price,
    orientation,
    pattern,
    singleLineCount,
    linesCount,
    stickersPerLine,
    labelCount
  });
}
