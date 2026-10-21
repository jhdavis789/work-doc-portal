'use strict';
const $ = id => document.getElementById(id);
let reportUrl;
const decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
$('unlock').addEventListener('submit', async event => {
  event.preventDefault();
  $('submit').disabled = true;
  $('status').textContent = 'Unlocking…';
  try {
    if (!crypto.subtle) throw new Error('WebCrypto unavailable');
    const response = await fetch('report.enc.json', {cache: 'no-store', credentials: 'omit'});
    if (!response.ok) throw new Error('Archive unavailable');
    const payload = await response.json();
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode($('key').value.trim()), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name: 'PBKDF2', salt: decode(payload.salt), iterations: payload.iterations, hash: 'SHA-256'}, material, {name: 'AES-GCM', length: 256}, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: decode(payload.iv), additionalData: new TextEncoder().encode(payload.aad)}, key, decode(payload.ciphertext));
    reportUrl = URL.createObjectURL(new Blob([plaintext], {type: 'text/html;charset=utf-8'}));
    $('download').href = reportUrl;
    $('report').src = reportUrl;
    $('key').value = '';
    $('gate').hidden = true;
    $('reader').hidden = false;
    $('status').textContent = '';
    $('download').focus();
  } catch (error) {
    $('status').textContent = error.name === 'OperationError' ? 'That key did not unlock the report. Please check it and try again.' : 'The report could not be opened. Check your connection and try again.';
  } finally {
    $('submit').disabled = false;
  }
});
$('lock').addEventListener('click', () => {
  $('report').removeAttribute('src');
  $('download').removeAttribute('href');
  if (reportUrl) URL.revokeObjectURL(reportUrl);
  reportUrl = undefined;
  $('reader').hidden = true;
  $('gate').hidden = false;
  $('key').focus();
});

// URL fragments stay local to the browser. Consume and remove the access key
// before requesting the encrypted payload; never persist it in browser storage.
function unlockLinkedReport() {
  const linkedKey = new URLSearchParams(location.hash.slice(1)).get('key');
  if (!linkedKey) return;
  history.replaceState(null, '', location.pathname + location.search);
  $('key').value = linkedKey;
  $('unlock').requestSubmit();
}
window.addEventListener('hashchange', unlockLinkedReport);
unlockLinkedReport();
