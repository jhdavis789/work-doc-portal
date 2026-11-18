'use strict';
const $ = id => document.getElementById(id);
let reportUrl;
let numbersUrl;
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
    const text = new TextDecoder().decode(plaintext);
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const numbersData = doc.getElementById('numbers-data');
    const numbers = JSON.parse(numbersData.textContent);
    numbersData.remove();
    numbersUrl = URL.createObjectURL(new Blob([numbers.csv], {type: 'text/csv;charset=utf-8'}));
    $('numbers-download').href = numbersUrl;
    // Keep the viewer sandboxed. Explicit srcdoc fragments stay in the iframe
    // rather than resolving against the portal URL or navigating to a blob.
    for (const anchor of doc.querySelectorAll('a[href^="#"]')) {
      anchor.setAttribute('href', 'about:srcdoc' + anchor.getAttribute('href'));
    }
    $('report').srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
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
  $('report').removeAttribute('srcdoc');
  $('download').removeAttribute('href');
  $('numbers-download').removeAttribute('href');
  if (numbersUrl) URL.revokeObjectURL(numbersUrl);
  numbersUrl = undefined;
  if (reportUrl) URL.revokeObjectURL(reportUrl);
  reportUrl = undefined;
  $('reader').hidden = true;
  $('gate').hidden = false;
  $('key').focus();
});

