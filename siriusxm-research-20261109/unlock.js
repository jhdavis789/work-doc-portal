'use strict';
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
document.getElementById('unlock').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=document.getElementById('submit'),status=document.getElementById('status'),input=document.getElementById('key');
  button.disabled=true;status.textContent='Opening…';
  const urls=[];
  try{
    const response=await fetch('research.enc.json',{cache:'no-store',credentials:'omit'});
    if(!response.ok)throw Error('Archive unavailable');
    const p=await response.json();
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(input.value.trim()),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:decode(p.salt),iterations:p.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(p.iv),additionalData:new TextEncoder().encode(p.aad)},key,decode(p.ciphertext));
    const files=JSON.parse(new TextDecoder().decode(plain));
    const text=name=>new TextDecoder().decode(decode(files[name]));
    const blob=(data,type)=>{const url=URL.createObjectURL(new Blob([data],{type}));urls.push(url);return url;};
    const modules={};
    for(const name of ['data.mjs','model.mjs','stock-model.mjs','app.mjs','stock-ui.mjs']){
      let source=text(name);
      for(const [dependency,url] of Object.entries(modules))source=source.replaceAll("'./"+dependency+"'",JSON.stringify(url));
      modules[name]=blob(source,'text/javascript');
    }
    const pdf=blob(decode(files['siri-investment-case.pdf']),'application/pdf');
    const css=blob(text('style.css'),'text/css');
    let html=text('index.html').replace('href="style.css"','href="'+css+'"');
    for(const name of ['app.mjs','stock-ui.mjs'])html=html.replace('src="'+name+'"','src="'+modules[name]+'"');
    html=html.replaceAll('href="siri-investment-case.pdf"','href="'+pdf+'" download="siri-investment-case.pdf"');
    html=html.replace('<body>','<body><div style="padding:8px 16px;text-align:right;background:#edf4f7"><button id="lock-research" style="cursor:pointer;padding:6px 12px">Lock research</button></div>');
    const lockCode="document.getElementById('lock-research').onclick=()=>{localStorage.removeItem('siri-deals-v1');localStorage.removeItem('siri-stock-v2');location.reload();};";
    html=html.replace('</body>','<script src="'+blob(lockCode,'text/javascript')+'"></script></body>');
    input.value='';
    document.open();document.write(html);document.close();
  }catch(error){
    urls.forEach(url=>URL.revokeObjectURL(url));
    status.textContent=error.name==='OperationError'?'That password did not unlock the research. Please try again.':'The research could not be opened. Check your connection and try again.';
    button.disabled=false;
  }
});
