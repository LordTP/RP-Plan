'use client';

import { useState, useRef, useEffect, type RefObject } from 'react';
import { Check, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusDropdownProps {
  value: string | null | undefined;
  options: string[];
  onSave: (value: string) => void;
  onCancel: () => void;
  size?: 'sm' | 'md';
  // Optional: parent container ref to use for click-outside detection.
  // Pass this when the dropdown lives alongside related UI (like an apply-to-PO menu)
  // so clicks on that UI don't trigger cancel.
  containerRef?: RefObject<HTMLElement>;
}

export function StatusDropdown({ value, options, onSave, onCancel, size = 'md', containerRef }: StatusDropdownProps) {
  const [selected, setSelected] = useState(value || '');
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const boundary = containerRef?.current || ref.current;
      if (boundary && !boundary.contains(e.target as Node)) {
        onCancel();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onCancel, containerRef]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const isSm = size === 'sm';

  return (
    <div ref={ref} className="relative">
      {/* Selected value display + actions */}
      <div className={cn(
        'flex items-center gap-1 border rounded-lg bg-white shadow-sm',
        isSm ? 'border-primary-300' : 'border-primary-300',
      )}>
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            'flex items-center justify-between gap-1 flex-1 text-left font-medium text-gray-700 hover:bg-gray-50 rounded-l-lg transition-colors',
            isSm ? 'px-2 py-0.5 text-[11px] min-w-[100px]' : 'px-3 py-1.5 text-xs min-w-[140px]'
          )}
        >
          <span className={selected ? '' : 'text-gray-400'}>{selected || '— None —'}</span>
          <ChevronDown className={cn('text-gray-400 transition-transform', isSm ? 'w-3 h-3' : 'w-3.5 h-3.5', open && 'rotate-180')} />
        </button>
        <button
          onClick={() => onSave(selected)}
          className={cn(
            'text-green-600 hover:bg-green-50 transition-colors',
            isSm ? 'p-1' : 'p-1.5'
          )}
          title="Confirm"
        >
          <Check className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </button>
        <button
          onClick={onCancel}
          className={cn(
            'text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-r-lg transition-colors',
            isSm ? 'p-1' : 'p-1.5'
          )}
          title="Cancel"
        >
          <X className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </button>
      </div>

      {/* Dropdown options */}
      {open && (
        <div className={cn(
          'absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden',
          isSm ? 'min-w-[140px]' : 'min-w-[180px]'
        )}>
          {/* None option */}
          <button
            onClick={() => { setSelected(''); setOpen(false); }}
            className={cn(
              'w-full text-left flex items-center justify-between transition-colors border-b border-gray-100',
              selected === '' ? 'bg-primary-50 text-primary-700' : 'text-gray-400 hover:bg-gray-50',
              isSm ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
            )}
          >
            <span className="italic">None</span>
            {selected === '' && <Check className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
          </button>
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { setSelected(opt); setOpen(false); }}
              className={cn(
                'w-full text-left flex items-center justify-between transition-colors',
                selected === opt
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50',
                isSm ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
              )}
            >
              <span>{opt}</span>
              {selected === opt && <Check className={cn('text-primary-600', isSm ? 'w-3 h-3' : 'w-3.5 h-3.5')} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
