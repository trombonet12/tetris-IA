// File export/import helpers (browser only).

/** Downloads text as a file. Uses the File System Access API when available. */
export async function downloadText(filename, text, mimeType = 'application/json') {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Fichero', accept: { [mimeType]: [`.${filename.split('.').pop()}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return true;
    } catch (err) {
      if (err?.name === 'AbortError') return false; // user cancelled
      // fall through to <a download>
    }
  }
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

/** Opens a file picker and resolves with the file's text (null if cancelled). */
export function pickTextFile(accept = '.json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    };
    // 'cancel' fires in modern Chrome/Edge when the dialog is dismissed.
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/**
 * Wires drag & drop of files onto an element.
 * @param {HTMLElement} el
 * @param {(text: string, filename: string) => void} onFileText
 * @returns {() => void} cleanup
 */
export function enableFileDrop(el, onFileText) {
  const onDragOver = (e) => {
    e.preventDefault();
    el.classList.add('drop-target');
  };
  const onDragLeave = () => el.classList.remove('drop-target');
  const onDrop = async (e) => {
    e.preventDefault();
    el.classList.remove('drop-target');
    const file = e.dataTransfer?.files?.[0];
    if (file) onFileText(await file.text(), file.name);
  };
  el.addEventListener('dragover', onDragOver);
  el.addEventListener('dragleave', onDragLeave);
  el.addEventListener('drop', onDrop);
  return () => {
    el.removeEventListener('dragover', onDragOver);
    el.removeEventListener('dragleave', onDragLeave);
    el.removeEventListener('drop', onDrop);
  };
}

/** Serializes rows (array of objects) to CSV text. */
export function toCsv(rows, columns = null) {
  if (rows.length === 0) return '';
  const cols = columns ?? Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const row of rows) lines.push(cols.map((c) => escape(row[c])).join(','));
  return lines.join('\n');
}
