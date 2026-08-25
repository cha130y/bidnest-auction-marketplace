import { Fragment } from 'react';

/**
 * AI-001 — turns the assistant's reply into paragraphs and lists instead of
 * one unbroken block of text. No markdown library: the system prompt asks
 * Gemini for a small, predictable subset (blank lines between points, `-`
 * for a list item, `**text**` for emphasis) and this only ever needs to
 * understand that subset, not markdown in general.
 */
export function MessageFormatter({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, index) => {
        const lines = block.split('\n').filter((line) => line.trim() !== '');
        const isList = lines.length > 0 && lines.every(isListLine);

        if (isList) {
          return (
            <ul key={index} className="ml-4 list-disc space-y-1">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(stripListMarker(line))}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className="whitespace-pre-line">
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

const LIST_MARKER = /^\s*(?:[-•]|\d+[.)])\s+/;

function isListLine(line: string): boolean {
  return LIST_MARKER.test(line);
}

function stripListMarker(line: string): string {
  return line.replace(LIST_MARKER, '');
}

/** `**bold**` only — the one emphasis marker the system prompt is told to use. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
