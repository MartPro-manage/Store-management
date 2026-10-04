import React from 'react';
import { DownloadAppButton } from './DownloadAppButton';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'nav' | 'minimal' | 'banner' | 'header' | 'compact' | 'primary';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'primary', className }) => {
  const mappedVariant = variant === 'sidebar' ? 'sidebar' : variant === 'nav' || variant === 'header' ? 'header' : variant === 'minimal' || variant === 'compact' ? 'compact' : 'primary';
  return <DownloadAppButton variant={mappedVariant} className={className} />;
};

export { DownloadAppButton };
