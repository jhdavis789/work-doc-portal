'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const encode = s => new TextEncoder().encode(s);
  const urls = new Set();
  let generation = 0;
  const clearDocuments = () => {
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
      for (const doc of data.documents) {
        const bytes = decode(doc.data);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b => b.toString(16).padStart(2,'0')).join('');
        if (digest !== doc.sha256) throw Error('Document integrity check failed');
        if (run !== generation) return;
        const card = document.createElement('article'); card.className = 'document';
        const heading = document.createElement('h2'); heading.textContent = doc.title;
        const detail = document.createElement('p'); detail.textContent = [doc.version,doc.pages+' pages','Word document'].filter(Boolean).join(' · ');
        const link = document.createElement('a'); link.className = 'download';
        const url = URL.createObjectURL(new Blob([bytes],{type:doc.mime})); urls.add(url);
        bytes.fill(0); delete doc.data;
        link.href = url; link.download = doc.filename; link.textContent = 'Download Word';
        link.setAttribute('aria-label','Download '+doc.title+(doc.version?' '+doc.version:'')+' as Word');
        card.append(heading,detail,link); fragment.append(card);
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
  $('lock').addEventListener('click',()=>lock());
  addEventListener('pagehide',()=>lock(false));
  addEventListener('pageshow',event=>{if(event.persisted)lock(false);});
})();
