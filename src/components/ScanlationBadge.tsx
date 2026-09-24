import React from 'react';
import { Users } from '@phosphor-icons/react';

interface ScanlationBadgeProps {
  groupName: string | null;
  className?: string;
}

export const ScanlationBadge: React.FC<ScanlationBadgeProps> = ({ groupName, className = '' }) => {
  const name = groupName?.trim() || 'Scanlation Desconhecida';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-white/[0.04] text-slate-300 border border-white/[0.08] ${className}`}
      title={`Traduzido por: ${name}`}
    >
      <Users weight="bold" className="w-3 h-3 text-primary shrink-0" />
      <span className="truncate max-w-[150px]">{name}</span>
    </span>
  );
};
