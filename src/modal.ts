// Native text input overlay (names, toi details, wishes): the pixel canvas can't host a keyboard.

// Only characters the pixel font can draw: Latin, Russian and Kazakh letters, digits, basic punctuation.
const ALLOWED = /[^A-Za-z0-9А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі .,!?'"():+%#/*=_-]/g;

export interface AskOptions {
  value?: string;
  max?: number;
  type?: 'text' | 'date' | 'area';
  placeholder?: string;
  upper?: boolean;
}

export function askText(opts: AskOptions = {}): Promise<string | null> {
  const modal = document.getElementById('modal')!;
  const form = modal.querySelector('form')!;
  form.querySelector('input, textarea')?.remove();
  const field = document.createElement(opts.type === 'area' ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement;
  if (field instanceof HTMLInputElement) {
    field.type = opts.type === 'date' ? 'date' : 'text';
    field.autocomplete = 'off';
  } else field.rows = 4;
  if (opts.max) field.maxLength = opts.max;
  field.placeholder = opts.placeholder ?? '';
  field.value = opts.value ?? '';
  form.prepend(field);
  modal.style.display = 'flex';
  field.focus();
  if (opts.type !== 'date') field.select();
  return new Promise((resolve) => {
    const close = (v: string | null) => {
      modal.style.display = 'none';
      form.onsubmit = null;
      modal.onpointerdown = null;
      resolve(v);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      let v = field.value;
      if (opts.type !== 'date') {
        v = v.replace(/\s+/g, ' ').replace(ALLOWED, '').trim();
        if (opts.upper) v = v.toUpperCase();
        if (opts.max) v = v.slice(0, opts.max);
      }
      close(v || null);
    };
    modal.onpointerdown = (e) => { if (e.target === modal) close(null); };
  });
}

export function askName(current: string): Promise<string | null> {
  return askText({ value: current, max: 12, upper: true });
}
