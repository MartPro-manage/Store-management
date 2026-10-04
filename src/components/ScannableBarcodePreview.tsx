import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Barcode as BarcodeIcon, AlertTriangle } from 'lucide-react';

interface ScannableBarcodePreviewProps {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  className?: string;
  compact?: boolean;
}

export const ScannableBarcodePreview: React.FC<ScannableBarcodePreviewProps> = ({
  value,
  width = 1.2,
  height = 32,
  displayValue = true,
  className = '',
  compact = false
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      setError('No barcode entered');
      return;
    }

    if (!svgRef.current) return;

    try {
      JsBarcode(svgRef.current, trimmed, {
        format: 'CODE128',
        width: compact ? 1.0 : width,
        height: compact ? 24 : height,
        displayValue: displayValue && !compact,
        fontSize: 10,
        textMargin: 2,
        margin: compact ? 2 : 4,
        background: '#ffffff',
        lineColor: '#000000',
        fontOptions: 'bold'
      });
      setError(null);
    } catch (err: any) {
      // If code128 failed, try auto or show friendly fallback
      try {
        JsBarcode(svgRef.current, trimmed, {
          format: 'auto',
          width: compact ? 1.0 : width,
          height: compact ? 24 : height,
          displayValue: displayValue && !compact,
          fontSize: 10,
          margin: compact ? 2 : 4
        });
        setError(null);
      } catch (innerErr) {
        setError('Invalid characters for barcode');
      }
    }
  }, [value, width, height, displayValue, compact]);

  const trimmed = (value || '').trim();

  if (!trimmed) {
    return (
      <div className={`flex items-center gap-1 text-[11px] text-slate-400 italic ${className}`}>
        <BarcodeIcon className="w-3.5 h-3.5 opacity-50" />
        <span>Type barcode to generate preview</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 ${className}`}>
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span className="truncate max-w-[140px]">{error}</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center bg-white p-1 rounded-md border border-slate-200 shadow-2xs ${className}`}>
      <svg ref={svgRef} className="max-w-full h-auto" />
      {compact && displayValue && (
        <span className="text-[9px] font-mono font-bold text-slate-800 tracking-wider">
          {trimmed}
        </span>
      )}
    </div>
  );
};
