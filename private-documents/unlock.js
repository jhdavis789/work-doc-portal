'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const encode = s => new TextEncoder().encode(s);
  const documentFormats = new Map([
    ['application/pdf', ['PDF', 'PDF']],
    ['text/html', ['HTML', 'Interactive HTML']],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['Excel', 'Excel workbook']],
  ]);
  const urls = new Set();
  let generation = 0;
  let csvUrl;
  let returnFocus;
  function closeDashboard(focus = true) {
    $('dashboard-frame').removeAttribute('srcdoc');
    $('dashboard-title').textContent = '';
    $('dashboard-csv').removeAttribute('href');
    $('dashboard-csv').removeAttribute('download');
    $('dashboard-view').hidden = true;
    $('documents').hidden = false;
    $('documents').closest('main').classList.remove('reading-dashboard');
    if (csvUrl) URL.revokeObjectURL(csvUrl);
    csvUrl = undefined;
    if (focus) returnFocus?.focus();
    returnFocus = undefined;
  }
  async function openDashboard(blob, doc, button, run) {
    button.disabled = true;
    $('view-status').hidden = true;
    try {
      const text = await blob.text();
      if (run !== generation) return;
      const report = new DOMParser().parseFromString(text, 'text/html');
      const data = report.getElementById('numbers-data');
      const {csv} = JSON.parse(data.textContent);
      data.remove();
      for (const anchor of report.querySelectorAll('a[href^="#"]')) {
        anchor.setAttribute('href', 'about:srcdoc' + anchor.getAttribute('href'));
      }
      closeDashboard(false);
      returnFocus = button;
      csvUrl = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
      $('dashboard-csv').href = csvUrl;
      $('dashboard-csv').download = doc.numbers_filename;
      $('dashboard-title').textContent = doc.title;
      $('dashboard-frame').srcdoc = '<!doctype html>' + report.documentElement.outerHTML;
      $('documents').hidden = true;
      $('documents').closest('main').classList.add('reading-dashboard');
      $('dashboard-view').hidden = false;
      $('dashboard-title').focus();
    } catch {
      if (run !== generation) return;
      closeDashboard(false);
      $('view-status').textContent = 'The dashboard could not be opened.';
      $('view-status').hidden = false;
    } finally {
      button.disabled = false;
    }
  }
  const clearDocuments = () => {
    closeDashboard(false);
    $('view-status').hidden = true;
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
    $('documents').replaceChildren();
  };
  function lock(focus = true) {
    generation++;
    clearDocuments();
    $('opened').hidden = true;
    $('locked').hidden = false;
    $('key').value = '';
    $('status').textContent = '';
    $('submit').disabled = false;
    if (focus) $('key').focus();
  }
  const decrypt = (key, part, aad) => crypto.subtle.decrypt(
    {name:'AES-GCM', iv:decode(part.iv), additionalData:encode(aad), tagLength:128}, key, decode(part.ciphertext));
  $('unlock').addEventListener('submit', async event => {
    event.preventDefault();
    const run = ++generation;
    $('submit').disabled = true;
    $('status').textContent = 'Opening…';
    try {
      if (!crypto.subtle) throw Error('Secure browser required');
      const material = await crypto.subtle.importKey('raw', encode($('key').value.trim()), 'PBKDF2', false, ['deriveKey']);
      $('key').value = '';
      const response = await fetch('payload.enc.json', {cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
      if (!response.ok) throw Error('Unavailable');
      const env = await response.json();
      if (env.version !== 1 || env.algorithm !== 'AES-256-GCM' || env.kdf.iterations !== 600000) throw Error('Unsupported package');
      const wrappingKey = await crypto.subtle.deriveKey({name:'PBKDF2',salt:decode(env.kdf.salt),iterations:env.kdf.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
      const rawKey = await decrypt(wrappingKey,env.wrappedKey,'private-documents:v1:key');
      const contentKey = await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['decrypt']);
      new Uint8Array(rawKey).fill(0);
      const raw = await decrypt(contentKey,env.payload,'private-documents:v1:index');
      const data = JSON.parse(new TextDecoder().decode(raw));
      new Uint8Array(raw).fill(0);
      if (data.version !== 1 || !Array.isArray(data.documents)) throw Error('Invalid index');
      const fragment = document.createDocumentFragment();
      const documents = data.documents.map((doc, index) => ({doc, index,
        time: Date.parse(doc.updated_at || doc.added_at || '') || 0}));
      documents.sort((a, b) => b.time - a.time || b.index - a.index);
      for (const {doc} of documents) {
        const bytes = decode(doc.data);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b => b.toString(16).padStart(2,'0')).join('');
        if (digest !== doc.sha256) throw Error('Document integrity check failed');
        if (run !== generation) return;
        const card = document.createElement('article'); card.className = 'document';
        const heading = document.createElement('h2'); heading.textContent = doc.title;
        const [format, formatLabel] = documentFormats.get(doc.mime) ?? ['Word', 'Word document'];
        const detail = document.createElement('p'); detail.textContent = [doc.version,doc.pages ? doc.pages+' pages' : null,formatLabel].filter(Boolean).join(' · ');
        const link = document.createElement('a'); link.className = 'download';
        const blob = new Blob([bytes], {type:doc.mime});
        const url = URL.createObjectURL(blob); urls.add(url);
        bytes.fill(0); delete doc.data;
        link.href = url; link.download = doc.filename; link.textContent = 'Download '+format;
        link.setAttribute('aria-label','Download '+doc.title+(doc.version?' '+doc.version:'')+' as '+format);
        card.append(heading, detail);
        if (doc.viewer === 'call-dashboard' && doc.mime === 'text/html') {
          const view = document.createElement('button'); view.type = 'button';
          view.className = 'view-dashboard'; view.textContent = 'View dashboard';
          view.addEventListener('click', () => openDashboard(blob, doc, view, run));
          card.append(view);
        }
        card.append(link); fragment.append(card);
      }
      if (run !== generation) return;
      $('documents').replaceChildren(fragment);
      $('locked').hidden = true; $('opened').hidden = false;
      $('status').textContent = ''; $('docs-title').focus();
    } catch (error) {
      if (run !== generation) return;
      clearDocuments();
      $('status').textContent = error.name === 'OperationError'
        ? 'Unable to unlock. Check the password and try again.'
        : 'The documents could not be opened. Check your connection and try again.';
    } finally {
      if (run === generation) { $('key').value = ''; $('submit').disabled = false; }
    }
  });
  $('back-to-documents').addEventListener('click', () => closeDashboard());
  $('lock').addEventListener('click',()=>lock());
  addEventListener('pagehide',()=>lock(false));
  addEventListener('pageshow',event=>{if(event.persisted)lock(false);});
})();
