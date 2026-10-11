/* Ein Bild pro Auftrag; Zwischenablage nur beim ausdrücklichen Einsetzen lesen. */
(() => {
  const limit = 10 * 1024 * 1024;
  const allowed = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  const images = new WeakMap();
  function message(pane, text) { pane.querySelector('.run-pane-image-status').textContent = text; }
  function clear(pane) {
    const previous = images.get(pane);
    if (previous) URL.revokeObjectURL(previous.url);
    images.delete(pane);
    pane.querySelector('.run-pane-image-preview').removeAttribute('src');
    pane.querySelector('.run-pane-attachment').hidden = true;
    message(pane, '');
  }
  function attach(pane, file) {
    if (pane.querySelector('.run-pane-send').disabled) return false;
    if (!allowed.has(file.type) || !file.size || file.size > limit) {
      message(pane, 'PNG, JPEG, GIF oder WebP verwenden, höchstens 10 MB.'); return true;
    }
    clear(pane);
    const attachment = {file, url:URL.createObjectURL(file)};
    images.set(pane, attachment);
    pane.querySelector('.run-pane-image-preview').src = attachment.url;
    pane.querySelector('.run-pane-attachment').hidden = false;
    message(pane, 'Bild eingefügt');
    return true;
  }
  window.HarnessImages = {
    setup(pane) {
      const fileInput = pane.querySelector('.run-pane-image-file');
      pane.querySelector('.run-pane-image-select').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        if (fileInput.files?.[0]) attach(pane, fileInput.files[0]);
        fileInput.value = '';
      });
      pane.querySelector('.run-pane-image-remove').addEventListener('click', () => clear(pane));
      pane.querySelector('.run-pane-input').addEventListener('paste', event => {
        const file = Array.from(event.clipboardData?.items || []).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
          || Array.from(event.clipboardData?.files || []).find(file => file.type.startsWith('image/'));
        if (file) { event.preventDefault(); attach(pane, file); }
      });
    },
    has:pane => images.has(pane), name:pane => images.get(pane)?.file.name || null, clear,
    async upload(pane) {
      const attachment = images.get(pane);
      if (!attachment) return null;
      if (attachment.imagePath) return attachment.imagePath;
      message(pane, 'Bild wird übertragen…');
      const response = await fetch('/api/images', {method:'POST', headers:{'Content-Type':attachment.file.type}, body:attachment.file});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Bild konnte nicht übertragen werden.');
      if (!result.imagePath) throw new Error('Bildpfad fehlt in der Serverantwort.');
      attachment.imagePath = result.imagePath;
      return attachment.imagePath;
    },
    error:message
  };
  // macOS-Screenshots können als TIFF vorliegen; die native App wandelt sie in PNG um.
  window.harnessPasteImage = dataURL => {
    const pane = document.activeElement?.matches('.run-pane-input') && document.activeElement.closest('.run-pane');
    if (!pane || !/^data:image\/(png|jpeg|gif|webp);base64,/.test(dataURL)) return false;
    const [header, encoded] = dataURL.split(',');
    if (encoded.length > Math.ceil(limit / 3) * 4) { message(pane, 'Das Bild darf höchstens 10 MB groß sein.'); return true; }
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    return attach(pane, new File([bytes], 'Bild', {type:header.slice(5, header.indexOf(';'))}));
  };
})();
