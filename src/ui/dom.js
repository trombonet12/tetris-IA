// Tiny DOM helpers shared by every scene. All chrome (panels, buttons,
// modals, toasts, form rows) is DOM+CSS; canvas is only for boards/charts.

/** el('div', {class: 'panel', onclick: fn}, child1, 'text', ...) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function button(label, onClick, cls = '') {
  return el('button', { class: `btn ${cls}`.trim(), onclick: onClick }, label);
}

/**
 * Modal dialog. Returns {overlay, close}. Buttons: [{label, cls, onClick}]
 * onClick returning false keeps the modal open.
 */
export function modal({ title, content, buttons = [], onClose = null, wide = false }) {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    if (typeof onClose === 'function') onClose();
  };
  const box = el(
    'div',
    { class: `modal ${wide ? 'modal-wide' : ''}` },
    title ? el('div', { class: 'modal-title' }, title) : null,
    el('div', { class: 'modal-content' }, content),
    buttons.length
      ? el(
          'div',
          { class: 'modal-buttons' },
          buttons.map((b) =>
            button(
              b.label,
              () => {
                if (b.onClick?.() !== false) close();
              },
              b.cls ?? '',
            ),
          ),
        )
      : null,
  );
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => e.target === overlay && onClose !== false && close() }, box);
  document.body.append(overlay);
  return { overlay, close };
}

export function confirmModal(message, { yes = 'Confirmar', no = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    modal({
      title: null,
      content: el('p', {}, message),
      onClose: () => resolve(false),
      buttons: [
        { label: no, cls: 'btn-ghost', onClick: () => resolve(false) },
        { label: yes, cls: danger ? 'btn-danger' : 'btn-primary', onClick: () => resolve(true) },
      ],
    });
  });
}

export function promptModal(message, { placeholder = '', value = '', ok = 'Aceptar', cancel = 'Cancelar' } = {}) {
  return new Promise((resolve) => {
    const input = el('input', { class: 'input', type: 'text', placeholder, value });
    const m = modal({
      title: null,
      content: el('div', {}, el('p', {}, message), input),
      onClose: () => resolve(null),
      buttons: [
        { label: cancel, cls: 'btn-ghost', onClick: () => resolve(null) },
        { label: ok, cls: 'btn-primary', onClick: () => resolve(input.value.trim()) },
      ],
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        resolve(input.value.trim());
        m.close();
      }
      e.stopPropagation();
    });
    setTimeout(() => input.focus(), 50);
  });
}

let toastContainer = null;

/** Transient notification (top-right stack). kind: '' | 'ok' | 'error' */
export function toast(message, kind = '', durationMs = 3200) {
  if (!toastContainer) {
    toastContainer = el('div', { class: 'toast-container' });
    document.body.append(toastContainer);
  }
  const node = el('div', { class: `toast toast-${kind}` }, message);
  toastContainer.append(node);
  setTimeout(() => node.classList.add('toast-out'), durationMs - 300);
  setTimeout(() => node.remove(), durationMs);
  return node;
}

// ── Form rows ──────────────────────────────────────────────────────────────

export function fieldRow(label, control, hint = null) {
  return el(
    'div',
    { class: 'field-row' },
    el('label', { class: 'field-label' }, label),
    el('div', { class: 'field-control' }, control, hint ? el('span', { class: 'field-hint' }, hint) : null),
  );
}

/** Slider with live value label. format: (v) => string */
export function slider({ min, max, step = 1, value, onChange, format = (v) => String(v) }) {
  const valueLabel = el('span', { class: 'slider-value' }, format(value));
  const input = el('input', {
    class: 'slider',
    type: 'range',
    min,
    max,
    step,
    value,
    oninput: () => {
      const v = Number(input.value);
      valueLabel.textContent = format(v);
      onChange(v);
    },
  });
  const wrap = el('div', { class: 'slider-wrap' }, input, valueLabel);
  wrap.setValue = (v) => {
    input.value = v;
    valueLabel.textContent = format(Number(v));
  };
  return wrap;
}

export function select({ options, value, onChange }) {
  const node = el(
    'select',
    { class: 'select', onchange: () => onChange(node.value) },
    options.map(([val, label]) => el('option', { value: val, selected: String(val) === String(value) ? '' : null }, label)),
  );
  return node;
}

export function checkbox({ checked, onChange, label = '' }) {
  const input = el('input', { type: 'checkbox', checked: checked ? '' : null, onchange: () => onChange(input.checked) });
  return el('label', { class: 'checkbox' }, input, el('span', {}, label));
}

export function numberInput({ min, max, step = 1, value, onChange, width = null }) {
  const node = el('input', {
    class: 'input input-number',
    type: 'number',
    min,
    max,
    step,
    value,
    style: width ? { width } : null,
    onchange: () => {
      let v = Number(node.value);
      if (Number.isNaN(v)) v = min;
      v = Math.max(min, Math.min(max, v));
      node.value = v;
      onChange(v);
    },
  });
  return node;
}

/** Tab bar: tabs = [{id, label}]. Returns {bar, setActive}. */
export function tabBar(tabs, active, onSelect) {
  const nodes = new Map();
  const bar = el(
    'div',
    { class: 'tab-bar' },
    tabs.map(({ id, label }) => {
      const node = button(label, () => onSelect(id), `tab ${id === active ? 'tab-active' : ''}`);
      nodes.set(id, node);
      return node;
    }),
  );
  return {
    bar,
    setActive(id) {
      for (const [tid, node] of nodes) node.classList.toggle('tab-active', tid === id);
    },
  };
}

/** Formats milliseconds as m:ss.cc (centiseconds). */
export function formatTime(ms, { centis = false } = {}) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = String(totalSeconds % 60).padStart(2, '0');
  if (!centis) return `${m}:${s}`;
  const c = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
  return `${m}:${s}.${c}`;
}

export function formatNumber(n) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n);
}
