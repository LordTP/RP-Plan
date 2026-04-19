'use client';

import React from 'react';

/**
 * Render a comment body, styling @username mentions distinctly from plain text.
 * Pattern matches the backend parser: `@` followed by 2–50 chars of
 * letters / digits / underscore / dot / hyphen.
 */
export function CommentText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  const regex = /@([A-Za-z0-9_.-]{2,50})/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={key++}
        className="inline bg-blue-50 text-blue-700 font-semibold rounded px-1 py-0.5"
      >
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span className={className}>{parts}</span>;
}
