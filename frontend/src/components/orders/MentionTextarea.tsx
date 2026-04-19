'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react';
import { usersApi, type MentionableUser } from '@/lib/api';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onMentionsChange?: (userIds: number[]) => void;
  onSubmit?: () => void; // optional: Cmd/Ctrl+Enter fires this
  onEnterSubmit?: boolean; // if true, plain Enter (no shift) submits
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  textareaClassName?: string; // override for the inner <textarea> styling
  rows?: number;
};

type TriggerState = {
  // The position of the '@' in the textarea value; null when no active mention.
  atIndex: number;
  // Query text after the '@' up to the caret position.
  query: string;
};

export function MentionTextarea({
  value,
  onChange,
  onMentionsChange,
  onSubmit,
  onEnterSubmit,
  placeholder,
  disabled,
  className,
  textareaClassName,
  rows = 3,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [trigger, setTrigger] = useState<TriggerState | null>(null);
  const [results, setResults] = useState<MentionableUser[]>([]);
  const [highlight, setHighlight] = useState(0);
  // Track which mentions have been inserted. We key by username because the
  // textarea value is plain text. When the user deletes "@username" from the
  // text, we remove the corresponding user_id.
  const [insertedMentions, setInsertedMentions] = useState<Map<string, number>>(new Map());

  // Fetch suggestions whenever the active query changes (debounced)
  useEffect(() => {
    if (!trigger) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      usersApi
        .getMentionableUsers(trigger.query, 8)
        .then((res) => {
          if (!cancelled) {
            setResults(res);
            setHighlight(0);
          }
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [trigger]);

  // Re-emit mention IDs when inserted set changes OR when value changes (for deletions)
  useEffect(() => {
    if (!onMentionsChange) return;
    const ids: number[] = [];
    insertedMentions.forEach((id, username) => {
      // Only keep if the `@username` still appears in the text
      if (new RegExp(`@${escapeRegex(username)}\\b`).test(value)) {
        ids.push(id);
      }
    });
    onMentionsChange(ids);
  }, [insertedMentions, value, onMentionsChange]);

  const detectTrigger = (text: string, caret: number): TriggerState | null => {
    // Walk backward from caret to find '@' that starts (or follows whitespace)
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === '@') {
        // Valid start: '@' is at index 0 or preceded by whitespace
        if (i === 0 || /\s/.test(text[i - 1])) {
          const query = text.slice(i + 1, caret);
          // Close popover if the query contains a whitespace (mention ended)
          if (/\s/.test(query)) return null;
          return { atIndex: i, query };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    onChange(text);
    const caret = e.target.selectionStart ?? text.length;
    setTrigger(detectTrigger(text, caret));
  };

  const insertMention = (user: MentionableUser) => {
    if (!trigger || !textareaRef.current) return;
    const ta = textareaRef.current;
    const caret = ta.selectionStart ?? value.length;
    const before = value.slice(0, trigger.atIndex);
    const after = value.slice(caret);
    const insertion = `@${user.username} `;
    const next = before + insertion + after;
    onChange(next);
    setTrigger(null);
    setInsertedMentions((prev) => {
      const m = new Map(prev);
      m.set(user.username, user.id);
      return m;
    });
    // Restore caret position after React updates the DOM
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = before.length + insertion.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (trigger && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % results.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + results.length) % results.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(results[highlight]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTrigger(null);
        return;
      }
    }
    if (onSubmit && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (onEnterSubmit && onSubmit && e.key === 'Enter' && !e.shiftKey && !trigger) {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }
  };

  const handleClickOrKey = () => {
    if (!textareaRef.current) return;
    const caret = textareaRef.current.selectionStart ?? value.length;
    setTrigger(detectTrigger(value, caret));
  };

  return (
    <div className={cn('relative', className)}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={handleClickOrKey}
        onKeyUp={(e) => {
          // Arrow keys / caret moves without change still need to re-detect
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) handleClickOrKey();
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={textareaClassName || 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none'}
      />
      {trigger && results.length > 0 && (
        <div
          className="absolute left-2 bottom-full mb-1 z-50 w-64 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1"
        >
          {results.map((u, i) => (
            <button
              key={u.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                i === highlight ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-50 text-[9px] font-bold text-primary-700 ring-1 ring-primary-200 flex-shrink-0">
                {initials(u.full_name || u.username)}
              </span>
              <span className="flex-1 min-w-0">
                <div className="font-semibold truncate">{u.full_name || u.username}</div>
                {u.full_name && <div className="text-[10px] text-gray-400 truncate">@{u.username}</div>}
              </span>
              <span className="text-[9px] text-gray-400 uppercase tracking-wider flex-shrink-0">{u.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function initials(s: string): string {
  return s.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
