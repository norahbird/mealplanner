import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Ingredient } from '../data/types';
import { cap, matchKey, normalizeName } from '../utils/names';

// ---- Sheet: slides up from the bottom on phones, a centered dialog on wider screens ---------

let openSheets = 0;

export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    openSheets++;
    document.body.classList.add('sheet-open');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (--openSheets === 0) document.body.classList.remove('sheet-open');
    };
  }, [onClose]);

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---- Small controls ---------------------------------------------------------------------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  small,
}: {
  options: { value: T; label: string; tone?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  small?: boolean;
}) {
  return (
    <div className={`segmented${small ? ' segmented--small' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`segmented-option${value === o.value ? ' is-selected' : ''}${o.tone ? ` tone-${o.tone}` : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 20, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}>
        −
      </button>
      <span className="stepper-value" aria-live="polite">
        {value}
      </span>
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}>
        +
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle-row">
      <span>
        <span className="toggle-label">{label}</span>
        {hint && <span className="toggle-hint">{hint}</span>}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children && <div className="page-header-actions">{children}</div>}
    </header>
  );
}

// ---- Ingredient search box ----------------------------------------------------------------

export function IngredientInput({
  value,
  onChange,
  onPick,
  onSubmit,
  ingredients,
  placeholder,
  id,
  autoFocus,
  exclude,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (ing: Ingredient) => void;
  /** Enter pressed without picking a suggestion. */
  onSubmit?: (text: string) => void;
  ingredients: Ingredient[];
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
  exclude?: (ing: Ingredient) => boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const blurTimer = useRef<number>();

  const matches = useMemo(() => {
    const q = normalizeName(value);
    if (!q) return [];
    const key = matchKey(q);
    const scored: [number, Ingredient][] = [];
    for (const ing of ingredients) {
      if (exclude?.(ing)) continue;
      const name = ing.name;
      const score = name.startsWith(q) || matchKey(name).startsWith(key) ? 0 : name.includes(q) ? 1 : -1;
      if (score >= 0) scored.push([score, ing]);
    }
    return scored
      .sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length)
      .slice(0, 6)
      .map((s) => s[1]);
  }, [value, ingredients, exclude]);

  const open = focused && matches.length > 0;

  function pick(ing: Ingredient) {
    onPick(ing);
    setHighlight(-1);
  }

  return (
    <div className="combo">
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="none"
        enterKeyHint="done"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => {
          window.clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setFocused(false), 150);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlight(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(matches.length - 1, h + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(-1, h - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && highlight >= 0) pick(matches[highlight]);
            else if (value.trim()) onSubmit?.(value.trim());
          }
        }}
      />
      {open && (
        <ul className="combo-list" role="listbox">
          {matches.map((ing, i) => (
            <li key={ing.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={i === highlight ? 'is-highlighted' : ''}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(ing)}
              >
                <span>{cap(ing.name)}</span>
                <span className="combo-meta">{ing.section}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Icons --------------------------------------------------------------------------------

const PATHS: Record<string, ReactNode> = {
  plan: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" />
      <circle cx="10" cy="20.5" r="1.2" />
      <circle cx="17" cy="20.5" r="1.2" />
    </>
  ),
  fridge: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2" />
      <path d="M5 10h14M9 6v1.5M9 13v3" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z" />
      <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  leftovers: (
    <>
      <path d="M4 11h16a8 8 0 0 1-16 0z" />
      <path d="M9 7c0-1.5 1-2 1-3.5M14 7c0-1.5 1-2 1-3.5" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
};

export function Icon({ name, size = 22 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon"
    >
      {PATHS[name]}
    </svg>
  );
}
