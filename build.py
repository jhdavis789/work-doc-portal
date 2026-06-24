#!/usr/bin/env python3
"""
build.py — emit the self-contained "Work Doc Portal" index page from entries.json.

A running index of links/deliverables to review and send (newest at top), with search,
date sorting, kind/tag filters, and copy-link buttons. Add a deliverable by appending an
object to entries.json (or use `python3 build.py --add ...`) then re-running this script.

Entry schema: {title, url, date (YYYY-MM-DD), kind, desc, tags[], pinned?}
"""
import json, sys, argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENTRIES = HERE / "entries.json"


def load():
    return json.loads(ENTRIES.read_text()) if ENTRIES.exists() else []


def add(args):
    items = load()
    items.append({
        "title": args.title, "url": args.url, "date": args.date,
        "kind": args.kind or "Doc", "desc": args.desc or "",
        "tags": [t.strip() for t in (args.tags or "").split(",") if t.strip()],
        "pinned": bool(args.pinned),
    })
    ENTRIES.write_text(json.dumps(items, indent=2))
    print(f"added '{args.title}' ({len(items)} entries)")


TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Work Doc Portal</title>
<script type="application/json" id="data">__DATA__</script>
<style>
:root{--navy:#00294b;--blue:#005f9e;--teal:#007e6c;--mag:#a6256e;--amber:#c8801f;
--ink:#243240;--mut:#5b6b7a;--line:#e3e8ed;--bg:#f4f6f8;--card:#fff;}
*{box-sizing:border-box}
body{margin:0;font:14.5px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
header{background:linear-gradient(100deg,var(--navy),#003f6e);color:#fff;padding:22px 26px}
header h1{margin:0;font-size:22px;font-weight:650;letter-spacing:.2px}
header p{margin:6px 0 0;font-size:13px;color:#c9dcec;max-width:820px}
.bar{position:sticky;top:0;z-index:10;background:#eef2f5;border-bottom:1px solid var(--line);padding:12px 26px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#q{flex:1;min-width:220px;padding:9px 13px;border:1px solid var(--line);border-radius:8px;font-size:14px;background:#fff}
.bar select,.bar button{padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:13px;cursor:pointer;color:var(--ink)}
.bar button.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{padding:5px 10px;border:1px solid var(--line);border-radius:14px;background:#fff;font-size:12.5px;cursor:pointer;color:var(--mut)}
.chip.on{background:var(--teal);color:#fff;border-color:var(--teal)}
.wrap{padding:18px 26px 50px;max-width:1080px}
.count{color:var(--mut);font-size:12.5px;margin:4px 0 14px}
.item{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:15px 17px;margin-bottom:12px;display:grid;grid-template-columns:96px 1fr auto;gap:14px;align-items:start}
.item.pin{border-color:var(--amber);box-shadow:0 0 0 1px var(--amber) inset}
.date{color:var(--mut);font-size:12.5px;font-variant-numeric:tabular-nums;padding-top:2px}
.pinlbl{display:inline-block;font-size:10px;color:#fff;background:var(--amber);border-radius:4px;padding:1px 5px;margin-top:5px;letter-spacing:.4px}
.ti a{color:var(--navy);font-weight:650;font-size:16px;text-decoration:none}
.ti a:hover{text-decoration:underline}
.kind{display:inline-block;font-size:11px;color:#fff;background:var(--blue);border-radius:5px;padding:2px 7px;margin-left:8px;vertical-align:middle}
.desc{color:#3a4a58;font-size:13px;margin:6px 0 8px}
.tags{display:flex;gap:6px;flex-wrap:wrap}
.tag{font-size:11.5px;color:var(--mut);background:#eef2f5;border-radius:10px;padding:2px 9px}
.actions{display:flex;flex-direction:column;gap:6px}
.actions button{padding:6px 11px;border:1px solid var(--line);border-radius:7px;background:#fff;font-size:12px;cursor:pointer;white-space:nowrap}
.actions a{padding:6px 11px;border:1px solid var(--line);border-radius:7px;background:#fff;font-size:12px;cursor:pointer;white-space:nowrap;text-decoration:none;color:var(--ink);text-align:center}
.empty{color:var(--mut);padding:30px;text-align:center}
mark{background:#ffe8a3;padding:0 1px}
</style></head>
<body>
<header>
<h1>Work Doc Portal</h1>
<p>Running index of deliverables &amp; links — newest at top. Search, filter by kind/tag, sort by date. Click a title to open; "Copy link" to grab the path. (Reviewed by JAOD; not auto-emailed.)</p>
</header>
<div class="bar">
  <input id="q" placeholder="Search title, description, tags, kind…" autocomplete="off">
  <select id="sort">
    <option value="new">Newest first</option>
    <option value="old">Oldest first</option>
    <option value="az">Title A→Z</option>
  </select>
  <div class="chips" id="kinds"></div>
</div>
<div class="wrap">
  <div class="count" id="count"></div>
  <div id="list"></div>
</div>
<script>
const DATA=JSON.parse(document.getElementById('data').textContent);
const qEl=document.getElementById('q'), sortEl=document.getElementById('sort'),
      listEl=document.getElementById('list'), countEl=document.getElementById('count'),
      kindsEl=document.getElementById('kinds');
let kindFilter=null;
const KINDS=[...new Set(DATA.map(d=>d.kind).filter(Boolean))].sort();
function buildKinds(){ kindsEl.innerHTML='';
  KINDS.forEach(k=>{ const c=document.createElement('span'); c.className='chip'+(kindFilter===k?' on':''); c.textContent=k;
    c.onclick=()=>{ kindFilter=(kindFilter===k?null:k); buildKinds(); render(); }; kindsEl.appendChild(c); }); }
function esc(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function hl(s,q){ s=esc(s); if(!q)return s; try{ return s.replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'),'<mark>$1</mark>'); }catch(e){ return s; } }
function matches(d,q){ if(!q)return true; const hay=(d.title+' '+(d.desc||'')+' '+(d.kind||'')+' '+(d.tags||[]).join(' ')).toLowerCase();
  return q.toLowerCase().split(/\s+/).every(t=>hay.includes(t)); }
function copy(url){ if(navigator.clipboard) navigator.clipboard.writeText(url); }
function render(){
  const q=qEl.value.trim();
  let items=DATA.filter(d=>(!kindFilter||d.kind===kindFilter)&&matches(d,q));
  const sort=sortEl.value;
  items.sort((a,b)=> sort==='az' ? a.title.localeCompare(b.title)
                   : sort==='old' ? (a.date<b.date?-1:a.date>b.date?1:0)
                   : (a.date>b.date?-1:a.date<b.date?1:0));
  if(sort!=='az'){ items.sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)); } // pinned float to top
  countEl.textContent=`${items.length} of ${DATA.length} item${DATA.length===1?'':'s'}`+(kindFilter?` · ${kindFilter}`:'')+(q?` · "${q}"`:'');
  if(!items.length){ listEl.innerHTML='<div class="empty">No matching items.</div>'; return; }
  listEl.innerHTML=items.map(d=>{
    const tags=(d.tags||[]).map(t=>`<span class="tag">${hl(t,q)}</span>`).join('');
    return `<div class="item${d.pinned?' pin':''}">
      <div class="date">${esc(d.date)||'—'}${d.pinned?'<br><span class="pinlbl">PINNED</span>':''}</div>
      <div><div class="ti"><a href="${esc(d.url)}" target="_blank" rel="noopener">${hl(d.title,q)}</a>${d.kind?`<span class="kind">${esc(d.kind)}</span>`:''}</div>
        <div class="desc">${hl(d.desc||'',q)}</div><div class="tags">${tags}</div></div>
      <div class="actions"><a href="${esc(d.url)}" target="_blank" rel="noopener">Open ↗</a>
        <button onclick="copy('${esc(d.url)}')">Copy link</button></div>
    </div>`; }).join('');
}
qEl.addEventListener('input',render); sortEl.addEventListener('change',render);
buildKinds(); render();
</script>
</body></html>"""


def build():
    items = load()
    html = TEMPLATE.replace("__DATA__", json.dumps(items))
    (HERE / "index.html").write_text(html)
    print(f"wrote index.html — {len(items)} entries")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")
    a = sub.add_parser("add")
    a.add_argument("--title", required=True); a.add_argument("--url", required=True)
    a.add_argument("--date", required=True); a.add_argument("--kind")
    a.add_argument("--desc"); a.add_argument("--tags"); a.add_argument("--pinned", action="store_true")
    args = ap.parse_args()
    if args.cmd == "add":
        add(args)
    build()


if __name__ == "__main__":
    main()
