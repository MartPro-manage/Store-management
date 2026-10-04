import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';

interface UniversalBackButtonProps {
  onBack: () => void;
  label?: string;
  className?: string;
  variant?: 'subtle' | 'solid';
}

export const UniversalBackButton: React.FC<UniversalBackButtonProps> = ({
  onBack,
  label = 'Back to Dashboard',
  className = '',
  variant = 'solid'
}) => {
  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.02, x: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onBack}
      id="universal-back-btn"
      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-2xs ${
        variant === 'solid'
          ? 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 hover:border-orange-300 hover:text-orange-600'
          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
      } ${className}`}
      title="Return to previous screen or main panel"
    >
      <ArrowLeft className="w-3.5 h-3.5 text-orange-600" />
      <span>{label}</span>
    </motion.button>
  );
};
