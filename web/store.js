// ===== ALMACENAMIENTO =====
// Modelo de datos en la web:
//   persons : { id -> {id,name,active,from,to,socia,savedAt} }       id = slug del nombre
//   sessions: { id -> {id,date,group,present[],others[],savedAt} }   id = AAAA-MM-DD (T1: AAAA-MM-DD-m / -t)
//   pagos   : { mes -> {month, rows:{ personaId -> {amount,date,savedAt} }} }
//   registre: [ {t, accio, ref, text} ]  historial de cambios, el más reciente primero
// Cada guardado es una OPERACIÓN con solo los cambios ({action, key, data}). Se apunta en una cola del móvil
// y se envía en orden; si no hay red, espera y se reenvía sola. Dos operaciones seguidas sobre lo mismo
// (misma sesión, mismo mes, misma persona) se funden en una.

const SHEET_URL = "{{SHEET_URL}}"; // se rellena en la versión de GitHub
const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const ID_PERSONA = /^[a-z0-9-]+$/, ID_SESION = /^\d{4}-\d{2}-\d{2}(-[a-z]+)?$/, ID_MES = /^\d{4}-\d{2}$/;

// "vienen a probar" también va por diferencias (othersAdd / othersRemove), sin mayúsculas/minúsculas
const lc = x => String(x).toLowerCase();
function othersTras(cur, d){
  let o = (d.others!=null && d.othersAdd==null && d.othersRemove==null) ? d.others.slice() : cur.slice();
  const fora=(d.othersRemove||[]).map(lc); o=o.filter(x=>!fora.includes(lc(x)));
  (d.othersAdd||[]).forEach(x=>{ if(x && !o.some(y=>lc(y)===lc(x))) o.push(x); });
  return o;
}
// ---- aplicar una operación sobre los datos del móvil (lo mismo que hace el puente en la hoja) ----
function aplicarOp(data, op){
  const d = op.data;
  if (op.action === "sessio"){
    const cur = data.sessions[d.id];
    const base = cur ? cur.present.slice() : [];
    const present = base.filter(p=>!(d.remove||[]).includes(p)); (d.add||[]).forEach(p=>{ if(!present.includes(p)) present.push(p); });
    data.sessions[d.id] = {id:d.id, date:d.date||(cur&&cur.date)||d.id.slice(0,10), group:d.group!=null?d.group:((cur&&cur.group)||""), present,
                           others: othersTras((cur&&cur.others)||[], d), savedAt:(cur&&cur.savedAt)||""};
  } else if (op.action === "pagaments"){
    const m = data.pagos[d.month] || (data.pagos[d.month] = {month:d.month, rows:{}});
    (d.unset||[]).forEach(pid=>{ delete m.rows[pid]; });
    Object.keys(d.set||{}).forEach(pid=>{ const a = m.rows[pid]; m.rows[pid] = {amount:Number(d.set[pid].amount)||0, date:(a&&a.date)||d.set[pid].date||"", savedAt:(a&&a.savedAt)||""}; });
  } else if (op.action === "mes"){
    data.settings = data.settings || {}; data.settings["tancat:"+d.month] = !!d.tancat;
  } else if (op.action === "persona"){
    const cur = data.persons[d.id] || {id:d.id, name:"", active:true, from:"", to:"", socia:{}};
    data.persons[d.id] = Object.assign({}, cur, d.set);
  }
}
// fundir dos operaciones sobre lo mismo: la segunda se aplica encima de la primera
function fundirOps(a, b){
  const x = JSON.parse(JSON.stringify(a.data)), y = b.data;
  if (a.action === "sessio"){
    const add = new Set(x.add||[]), rem = new Set(x.remove||[]);
    // quitar a alguien que solo estaba por un cambio propio aún sin subir = deshacer ese cambio (no borrar en la hoja)
    (y.add||[]).forEach(p=>{ if(rem.has(p)) rem.delete(p); else add.add(p); }); (y.remove||[]).forEach(p=>{ if(add.has(p)) add.delete(p); else rem.add(p); });
    x.add=[...add]; x.remove=[...rem];
    const oa=new Map((x.othersAdd||[]).map(o=>[lc(o),o])), or=new Map((x.othersRemove||[]).map(o=>[lc(o),o]));
    (y.othersAdd||[]).forEach(o=>{ if(or.has(lc(o))) or.delete(lc(o)); else oa.set(lc(o),o); }); (y.othersRemove||[]).forEach(o=>{ if(oa.has(lc(o))) oa.delete(lc(o)); else or.set(lc(o),o); });
    x.othersAdd=[...oa.values()]; x.othersRemove=[...or.values()]; if (y.others!=null) x.others=y.others; if (y.date) x.date=y.date; if (y.group!=null) x.group=y.group;
  } else if (a.action === "pagaments"){
    x.set = x.set||{}; const uns = new Set(x.unset||[]), nous = new Set(x.nous||[]);
    Object.keys(y.set||{}).forEach(pid=>{ if(!uns.has(pid) && (y.nous||[]).includes(pid)) nous.add(pid); uns.delete(pid); x.set[pid]=y.set[pid]; });
    (y.unset||[]).forEach(pid=>{ const propio=nous.has(pid); delete x.set[pid]; nous.delete(pid); if(!propio) uns.add(pid); }); // un pago propio aún sin subir se deshace
    x.unset=[...uns]; x.nous=[...nous];
  } else if (a.action === "persona"){ x.set = Object.assign({}, x.set, y.set); }
  else if (a.action === "mes"){ x.tancat = y.tancat; }
  return {action:a.action, key:a.key, data:x, t:b.t};
}

function normalizar(j){
  const pad=n=>String(n).padStart(2,"0");
  const isoD=v=>{ if(v==null||v==="") return ""; const s=String(v); if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10); if(ID_MES.test(s)) return s+"-01"; const d=new Date(s); return isNaN(d)?s:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const isoM=v=>{ const s=isoD(v); return s.length>=7?s.slice(0,7):s; };
  const persons={},sessions={},pagos={};
  (j.persons||[]).forEach(p=>{ if(!ID_PERSONA.test(p.id)) return; p.from=isoM(p.from); p.to=isoM(p.to); p.socia=p.socia||{}; persons[p.id]=p; });
  (j.sessions||[]).forEach(s=>{ s.date=isoD(s.date); if(!ID_SESION.test(String(s.id))) s.id=s.date+(s.group==="matí"?"-m":s.group==="tarda"?"-t":""); if(!ID_SESION.test(s.id)) return;
    s.present=(s.present||[]).filter(x=>ID_PERSONA.test(x)); s.others=s.others||[]; sessions[s.id]=s; });
  (j.pagos||[]).forEach(p=>{ p.month=isoM(p.month); if(!ID_MES.test(p.month)) return; const rows={}; Object.keys(p.rows||{}).forEach(pid=>{ if(ID_PERSONA.test(pid)){ const r=p.rows[pid]; r.date=isoD(r.date); rows[pid]=r; } }); p.rows=rows; pagos[p.month]=p; });
  return {persons,sessions,pagos,settings:j.settings||{},registre:j.registre||[]};
}

function SheetStore(url){
  const QK="tdr-queue", CK="tdr-cache";
  const ls = { get(k){ try{ return JSON.parse(localStorage.getItem(k)||"null"); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} } };
  const queue=()=>{ const q=ls.get(QK); return Array.isArray(q)?q.filter(o=>o&&o.action&&o.key):[]; };
  const setQueue=q=>ls.set(QK,q);
  const st = { onResult:null, onChange:null, errors:[], ultimo:{} };
  async function post(op){
    let r, j;
    try { r = await fetch(url,{method:"POST",body:JSON.stringify({action:op.action,data:op.data})}); } // sin cabeceras: evita el preflight CORS
    catch(e){ throw Object.assign(new Error("sin red"),{red:true}); }
    try { j = await r.json(); } catch(e){ throw Object.assign(new Error("respuesta no válida"),{red:true}); }
    // "acción desconocida" = el puente de la hoja aún es la versión anterior: se guarda y se reintenta más tarde
    if (!j.ok) throw Object.assign(new Error(j.error||"error del servidor"),{red:!!j.retry || /desconocida/.test(j.error||"")});
    return j;
  }
  let flushing = null; const leyendo = [];
  function flush(){
    if (flushing) return flushing;
    flushing = (async()=>{
      let q = queue();
      while (q.length){
        const op = q[0];
        try { const res = await post(op); q = queue(); q.shift(); setQueue(q); st.ultimo[op.key] = res;
          leyendo.forEach(l=>l.push(op));                                    // por si una lectura en curso trae datos de antes
          const c=ls.get(CK); if(c&&c.data){ aplicarOp(c.data,op); ls.set(CK,c); } // la copia del móvil, al día
          if (st.onResult) st.onResult(op,res); }
        catch(e){ if (e.red) break; q = queue(); q.shift(); setQueue(q); st.errors.push({op, error:e.message}); if (st.onResult) st.onResult(op,null,e); }
      }
      if (st.onChange) st.onChange();
    })().finally(()=>{ flushing=null; });
    return flushing;
  }
  return Object.assign(st, {
    name:"sheet",
    pending(){ return queue(); },
    cached(){ const c=ls.get(CK); return c&&c.data ? c.data : null; },
    async load(){
      await flush().catch(()=>{});
      const hechas=[]; leyendo.push(hechas);
      try {
        const r=await fetch(url+"?t="+Date.now()); const j=await r.json(); if(!j.ok) throw new Error(j.error||"error");
        const data=normalizar(j); hechas.forEach(op=>aplicarOp(data,op)); ls.set(CK,{t:Date.now(),data:JSON.parse(JSON.stringify(data))});
        queue().forEach(op=>aplicarOp(data,op)); // lo pendiente de subir se ve igualmente
        return data;
      } finally { leyendo.splice(leyendo.indexOf(hechas),1); }
    },
    // apunta la operación en la cola y la envía (después de las anteriores). Devuelve la respuesta del puente,
    // o {encola:true} si no hay red (se enviará sola). Lanza error si el puente la rechaza.
    async send(op){
      op.t = Date.now();
      let q = queue(); const i = q.findIndex((o,k)=>o.key===op.key && (k>0 || !flushing)); // la primera puede estar enviándose
      if (i>=0) q[i] = fundirOps(q[i], op); else q.push(op);
      setQueue(q); if (st.onChange) st.onChange();
      await flush();
      if (queue().some(o=>o.key===op.key)) return {encola:true};
      const err = st.errors.find(x=>x.op.key===op.key && x.op.t>=op.t); if (err) throw new Error(err.error);
      return st.ultimo[op.key] || {};
    },
    retry(){ return flush(); },
  });
}

function LocalStore(){ // último recurso: solo este navegador
  const K="tdr-data";
  const read=()=>{ try{ return JSON.parse(localStorage.getItem(K)||"null")||{persons:{},sessions:{},pagos:{},settings:{},registre:[]}; }catch(e){ return {persons:{},sessions:{},pagos:{},settings:{},registre:[]}; } };
  return { name:"local", pending:()=>[], cached:()=>null, retry:async()=>{}, async load(){ return read(); },
    async send(op){ const d=read(); aplicarOp(d,op); try{ localStorage.setItem(K,JSON.stringify(d)); }catch(e){} return {}; } };
}

async function pickStore(){
  if(SHEET_URL && SHEET_URL.startsWith("https://")) return SheetStore(SHEET_URL);
  return LocalStore();
}
