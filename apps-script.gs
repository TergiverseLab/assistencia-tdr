// Puente entre la página "Assistència Teatre dels Records" y esta hoja de cálculo.
// Se pega en Extensiones > Apps Script de la hoja y se publica como "Aplicación web".
// Pestañas de DATOS (las escribe la web, no se tocan a mano): "dades · Persones", "dades · Sessions",
// "dades · Pagaments", "dades · Config", "dades · Registre" (historial de cambios).
// Pestañas PARA MIRAR: las genera actualitzarVistes() (más abajo).

const SHEETS = {
  persons:  ["dades · Persones",  ["id","nom","activa","des de","fins","sòcia (JSON)","actualitzat"], "Persones"],
  sessions: ["dades · Sessions",  ["id","data","grup","assistents (ids)","altres","noves","total","actualitzat"], "Sessions"],
  pagos:    ["dades · Pagaments", ["mes","persona (id)","import","data pagament","actualitzat"], "Pagaments"],
  settings: ["dades · Config",    ["clau","valor","actualitzat"], "Config"],
  registre: ["dades · Registre",  ["data","acció","referència","detall"], ""],
};

function sheet(key){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const [name, header, old] = SHEETS[key];
  let sh = ss.getSheetByName(name);
  if (!sh && old){ const o = ss.getSheetByName(old); if (o && String(o.getRange(1,1).getValue()) === header[0]){ o.setName(name); sh = o; } } // nombre antiguo
  if (!sh){
    sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1);
    if (key === "sessions") sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat("@"); // ids como texto, no fechas
  }
  return sh;
}
function rows(key){ const sh = sheet(key); const v = sh.getDataRange().getValues(); return v.slice(1); }
function isDate(x){ return !!x && typeof x==="object" && typeof x.getTime==="function"; }
function norm(x){ return isDate(x) ? fmtDate(x) : String(x==null?"":x).trim(); }
function out(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function outText(t){ return ContentService.createTextOutput(t).setMimeType(ContentService.MimeType.JSON); }
function fmtDate(d){ return isDate(d) ? Utilities.formatDate(d, "Europe/Madrid", "yyyy-MM-dd") : String(d||""); }
function fmtMonth(d){ return isDate(d) ? Utilities.formatDate(d, "Europe/Madrid", "yyyy-MM") : String(d||"").slice(0,7); }
function iso(d){ return isDate(d) ? Utilities.formatDate(d, "Europe/Madrid", "yyyy-MM-dd'T'HH:mm:ss") : ""; }
function upsert(key, keyCols, row){ // solo para las acciones antiguas y la importación
  const sh = sheet(key); const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++){
    if (keyCols.every(c => norm(v[i][c]) === norm(row[c]) || (key==="pagos"&&c===0&&fmtMonth(v[i][c])===fmtMonth(row[c])))){ sh.getRange(i+1, 1, 1, row.length).setValues([row]); return; }
  }
  sh.appendRow(row);
}
function nomsPersones(){ const n = {}; rows("persons").forEach(r=>{ if (r[0]) n[String(r[0])] = String(r[1]); }); return n; }
function registrar(accio, ref, text, ara){ sheet("registre").appendRow([ara, accio, String(ref), text]); }

// ---------- LECTURA: la web lo pide todo al abrirse (con caché hasta el próximo cambio) ----------
function llegirTot(){
  const persons = rows("persons").filter(r=>r[0]).map(r=>{ let socia={}; try{ socia = r[5] ? JSON.parse(r[5]) : {}; }catch(e){}
    return { id:String(r[0]), name:String(r[1]), active:String(r[2]).toLowerCase()!=="no", from:fmtMonth(r[3]), to:fmtMonth(r[4]), socia, savedAt:iso(r[6]) }; });
  const sessions = rows("sessions").filter(r=>r[0]).map(r=>({ id:norm(r[0]), date:fmtDate(r[1]), group:String(r[2]||""), present:llistaIds(r[3]), others:llistaIds(r[4]), savedAt:iso(r[7]) }));
  const byMonth = {};
  rows("pagos").filter(r=>r[0] && String(r[1])!=="__tancat__").forEach(r=>{ const m = fmtMonth(r[0]); byMonth[m] = byMonth[m] || {month:m, rows:{}};
    byMonth[m].rows[String(r[1])] = {amount:Number(r[2])||0, date:fmtDate(r[3]), savedAt:iso(r[4])}; });
  const settings = {}; rows("settings").filter(r=>r[0]).forEach(r=>{ try{ settings[String(r[0])] = JSON.parse(r[1]); }catch(e){ settings[String(r[0])] = r[1]; } });
  const reg = rows("registre").filter(r=>r[0]);
  const registre = reg.slice(-400).reverse().map(r=>({ t:iso(r[0]), accio:String(r[1]), ref:String(r[2]), text:String(r[3]) }));
  return { ok:true, persons, sessions, pagos:Object.values(byMonth), settings, registre };
}
function doGet(){
  const cache = CacheService.getScriptCache(); const hit = cache.get("tot");
  if (hit) return outText(hit);
  const json = JSON.stringify(llegirTot());
  if (json.length < 95000) cache.put("tot", json, 21600);
  return outText(json);
}

// ---------- ESCRITURA: la web manda {action, data} con SOLO LOS CAMBIOS ----------
function doPost(e){
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch(err) { return out({ok:false, error:"ocupado", retry:true}); }
  try{
    const body = JSON.parse(e.postData.contents); const d = body.data || {}; const ara = new Date(); const res = {ok:true};
    if (body.action === "sessio") res.session = opSessio(d, ara);
    else if (body.action === "pagaments") res.pagos = opPagaments(d, ara);
    else if (body.action === "persona") res.person = opPersona(d, ara);
    else if (body.action === "mes") res.mes = opMes(d, ara);
    // acciones de versiones anteriores de la web (por si un móvil tiene la página vieja abierta)
    else if (body.action === "session"){ const id = d.id || d.date; opSessio({id, date:d.date, group:d.group||"", add:d.present||[], remove:[], others:d.others||[]}, ara); }
    else if (body.action === "person"){ opPersona({id:d.id, set:{name:d.name, active:d.active!==false, from:d.from||"", to:d.to||"", socia:d.socia||{}}}, ara); }
    else if (body.action === "pago"){ const set = {}; Object.keys(d.rows||{}).forEach(pid=>set[pid] = d.rows[pid]); opPagaments({month:d.month, set, unset:[]}, ara); }
    else if (body.action === "deleteSession"){
      const sh = sheet("sessions"); const v = sh.getDataRange().getValues();
      for (let i = v.length-1; i >= 1; i--){ if (norm(v[i][0]) === norm(d.id)) sh.deleteRow(i+1); }
      registrar("sessio", d.id, "Sesión borrada: " + d.id, ara);
    }
    else if (body.action === "settings"){ Object.keys(d||{}).forEach(k => upsert("settings", [0], [k, JSON.stringify(d[k]), ara])); }
    else return out({ok:false, error:"acción desconocida"});
    CacheService.getScriptCache().remove("tot");
    PropertiesService.getScriptProperties().setProperty("vistesPendents", "1"); // las vistas se rehacen solas en <10 min
    return out(res);
  } catch(err) { return out({ok:false, error:String(err)}); }
  finally { lock.releaseLock(); }
}

function opSessio(d, ara){
  const sh = sheet("sessions"); const v = sh.getDataRange().getValues(); let fila = -1;
  for (let i = 1; i < v.length; i++){ if (norm(v[i][0]) === String(d.id)){ fila = i; break; } }
  const cur = fila > 0 ? {present:llistaIds(v[fila][3]), others:llistaIds(v[fila][4])} : null;
  const r = aplicarSessio(cur, d);
  const grup = d.group != null ? String(d.group) : (fila > 0 ? String(v[fila][2]||"") : "");
  const date = d.date || (fila > 0 ? fmtDate(v[fila][1]) : String(d.id).slice(0,10));
  const fil = [String(d.id), date, grup, r.present.join(", "), r.others.join(", "), r.others.length, r.present.length + r.others.length, ara];
  if (fila > 0) sh.getRange(fila+1, 1, 1, fil.length).setValues([fil]); else sh.appendRow(fil);
  registrar("sessio", d.id, textSessio(date, grup, r, nomsPersones()), ara);
  return {id:String(d.id), date, group:grup, present:r.present, others:r.others, savedAt:iso(ara)};
}

function opPagaments(d, ara){
  const sh = sheet("pagos"); const v = sh.getDataRange().getValues();
  const files = v.slice(1).filter(r=>r[0]!=="" && r[1]!=="").map(r=>({mes:fmtMonth(r[0]), pid:String(r[1]), imp:Number(r[2])||0, data:fmtDate(r[3]), act:r[4]}));
  const r = aplicarPagaments(files, d);
  const nou = r.files.map(f=>[f.mes, f.pid, f.imp, f.data, f.nou ? ara : f.act]);
  if (v.length > 1) sh.getRange(2, 1, v.length-1, 5).clearContent();  // se reescribe de una vez, en memoria
  if (nou.length) sh.getRange(2, 1, nou.length, 5).setValues(nou);
  registrar("pagaments", d.month, textPagaments(d.month, r.canvis, nomsPersones()), ara);
  const rowsMes = {}; r.files.filter(f=>f.mes===d.month).forEach(f=>{ rowsMes[f.pid] = {amount:f.imp, date:f.data, savedAt:iso(f.nou ? ara : f.act)}; });
  return {month:d.month, rows:rowsMes};
}

function opPersona(d, ara){
  const sh = sheet("persons"); const v = sh.getDataRange().getValues(); let fila = -1;
  for (let i = 1; i < v.length; i++){ if (String(v[i][0]) === String(d.id)){ fila = i; break; } }
  let cur = null;
  if (fila > 0){ let socia = {}; try{ socia = v[fila][5] ? JSON.parse(v[fila][5]) : {}; }catch(e){}
    cur = {id:String(v[fila][0]), name:String(v[fila][1]), active:String(v[fila][2]).toLowerCase()!=="no", from:fmtMonth(v[fila][3]), to:fmtMonth(v[fila][4]), socia}; }
  if (!cur && !(d.set && d.set.name)) throw new Error("persona nueva sin nombre");
  const r = aplicarPersona(cur, String(d.id), d.set || {});
  const p = r.p;
  const fil = [p.id, p.name, p.active ? "sí" : "no", p.from || "", p.to || "", JSON.stringify(p.socia || {}), ara];
  if (fila > 0) sh.getRange(fila+1, 1, 1, fil.length).setValues([fil]); else sh.appendRow(fil);
  registrar("persona", p.id, textPersona(p, r.canvis), ara);
  return Object.assign({}, p, {savedAt:iso(ara)});
}

// cerrar / reabrir un mes de cuotas (lo ven todos los móviles)
function opMes(d, ara){
  const m = String(d.month).slice(0,7); const tancat = !!d.tancat;
  upsert("settings", [0], ["tancat:" + m, JSON.stringify(tancat), ara]);
  registrar("mes", m, (tancat ? "Mes cerrado: " : "Mes reabierto: ") + mesES(m), ara);
  return {month:m, tancat};
}
// ===================== PONT · CÀLCULS (puros, sin tocar la hoja) =====================
// Cada guardado de la web manda SOLO LOS CAMBIOS respecto a lo que veía en pantalla.
// Así, si Mario y Emi guardan a la vez, se suman los cambios de los dos en vez de pisarse.

function netejaText(s){ s = String(s==null ? "" : s).trim(); return /^[=+\-@]/.test(s) ? "'" + s : s; } // evita fórmulas
function llistaIds(v){ return String(v==null ? "" : v).split(",").map(x=>x.trim()).filter(Boolean); }
function unics(a){ const v = []; a.forEach(x=>{ if (x && v.indexOf(x) < 0) v.push(x); }); return v; }

// sesión: cur = {present[], others[]} o null · op = {add[], remove[], others[]|null}
function aplicarSessio(cur, op){
  const base = cur ? cur.present.slice() : [];
  const treu = op.remove || [];
  const present = base.filter(p=>treu.indexOf(p) < 0);
  (op.add || []).forEach(p=>{ if (present.indexOf(p) < 0) present.push(p); });
  const others = op.others != null ? unics(op.others.map(netejaText)) : (cur ? cur.others : []);
  return { present, others,
           afegits: (op.add || []).filter(p=>base.indexOf(p) < 0),
           trets: base.filter(p=>treu.indexOf(p) >= 0) };
}

// pagos: files = [{mes, pid, imp, data, act}] (todas las de la hoja) · op = {month, set:{pid:{amount,date}}, unset:[pid]}
function aplicarPagaments(files, op){
  const set = op.set || {}, unset = op.unset || [];
  const abans = {}; files.forEach(f=>{ if (f.mes === op.month && f.pid !== "__tancat__") abans[f.pid] = f; });
  const toca = Object.keys(set).concat(unset);
  const queden = files.filter(f=>!(f.mes === op.month && (toca.indexOf(f.pid) >= 0 || f.pid === "__tancat__")));
  const ara = [], canvis = [];
  Object.keys(set).forEach(pid=>{
    const a = abans[pid]; const imp = Number(set[pid].amount) || 0;
    const nou = !a || a.imp !== imp;
    ara.push({mes: op.month, pid, imp, data: (a && a.data) || set[pid].date || "", act: nou ? null : a.act, nou});
    if (!a) canvis.push({pid, tipus: "+", imp}); else if (a.imp !== imp) canvis.push({pid, tipus: "~", abans: a.imp, imp});
  });
  unset.forEach(pid=>{ if (abans[pid] && !set[pid]) canvis.push({pid, tipus: "-", imp: abans[pid].imp}); });
  return { files: queden.concat(ara), canvis };
}

// persona: cur = {id,name,active,from,to,socia} o null · set = campos que cambian
function aplicarPersona(cur, id, set){
  const p = Object.assign({id, name: "", active: true, from: "", to: "", socia: {}}, cur || {});
  const canvis = [];
  if (!cur) canvis.push("alta");
  if (set.name != null && netejaText(set.name) !== p.name){ if (cur) canvis.push("nom:" + p.name); p.name = netejaText(set.name); }
  if (set.active != null && !!set.active !== p.active){ canvis.push(set.active ? "reactivada" : "baixa"); p.active = !!set.active; }
  if (set.from != null) p.from = String(set.from);
  if (set.to != null) p.to = String(set.to);
  if (set.socia != null){
    const ab = p.socia || {}, nou = set.socia || {};
    Object.keys(nou).forEach(k=>{ if (!ab[k]) canvis.push("socia+" + k + ":" + nou[k].amount); });
    Object.keys(ab).forEach(k=>{ if (!nou[k]) canvis.push("socia-" + k); });
    p.socia = nou;
  }
  return { p, canvis };
}

// ---- textos del historial (en castellano, como la web) ----
function dmy2(d){ return d ? d.slice(8,10) + "/" + d.slice(5,7) + "/" + d.slice(0,4) : ""; }
const MESOS_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function mesES(m){ return MESOS_ES[Number(m.slice(5,7))-1] + " " + m.slice(0,4); }
function textSessio(date, grup, r, noms){
  const nom = p=>noms[p] || p;
  const parts = r.afegits.map(p=>"+" + nom(p)).concat(r.trets.map(p=>"−" + nom(p)));
  return "Sesión del " + dmy2(date) + (grup ? " (grupo " + grup + ")" : "") + ": " +
         (parts.length ? parts.join(", ") : "sin cambios en la lista") + " · " + (r.present.length + r.others.length) + " personas";
}
function textPagaments(month, canvis, noms){
  const nom = p=>noms[p] || p;
  const parts = canvis.map(c=> c.tipus === "+" ? "+" + nom(c.pid) + " " + c.imp + " €" : c.tipus === "-" ? "−" + nom(c.pid) : nom(c.pid) + " " + c.abans + " → " + c.imp + " €");
  return "Pagos de " + mesES(month) + ": " + (parts.length ? parts.join(", ") : "sin cambios");
}
function textPersona(p, canvis){
  if (!canvis.length) return "Persona " + p.name + ": sin cambios";
  return canvis.map(c=>{
    if (c === "alta") return "Alta: " + p.name;
    if (c === "baixa") return "Baja: " + p.name;
    if (c === "reactivada") return "Vuelve a estar activa: " + p.name;
    if (c.indexOf("nom:") === 0) return "Nombre cambiado: " + c.slice(4) + " → " + p.name;
    if (c.indexOf("socia+") === 0){ const x = c.slice(6).split(":"); return "Socia " + x[0] + ": " + p.name + " (" + x[1] + " €)"; }
    if (c.indexOf("socia-") === 0) return "Socia " + c.slice(6) + " quitada: " + p.name;
    return c;
  }).join(" · ");
}
// ===================== VISTES · 1. CÀLCULS (sin tocar la hoja) =====================
// Todo lo que se ve en las pestañas para mirar sale de aquí. Funciones puras: reciben filas y devuelven tablas.

const WEB_URL  = "https://tergiverselab.github.io/assistencia-tdr/";
const LOGO_URL = "https://tergiverselab.github.io/assistencia-tdr/icons/icon-512.png";
const LLISTES_DIGITALS_DES_DE = "2026-11-04";  // desde aquí, cada sesión tiene lista real hecha con la web
const FALTES_ESTIMADES = 1.5;                   // T2-T3 sin lista: inscritas − 1,5 (nunca faltan más de 3; criterio de Mario, 2/11/2026)
const HORES_SESSIO = 2;
const TEMPORADES = [
  {id:"T1", periode:"oct.–des. 2025",     ini:"2025-10-01", fi:"2026-01-31", finan:"Ajuntament de Malgrat (contracte menor)"},
  {id:"T2", periode:"febr.–juny 2026",    ini:"2026-02-01", fi:"2026-08-31", finan:"Quotes de les participants"},
  {id:"T3", periode:"set. 2026 – juny 2027", ini:"2026-09-01", fi:"2027-08-31", finan:"Quotes de les participants"},
];
const PECES = [
  ["T1", "Off the Record", "Tour sonor de records pels carrers de Malgrat", "2025-12-21", "Centre Cultural i carrers de Malgrat"],
  ["T2", "The Divas",      "Gala de projecció de 9 videoclips",              "2026-06-10", "Centre Cultural"],
  ["T2", "(T)ACTOS",       "Performance d'escriptura en viu",               "2026-06-26", "Malgrat amb Orgull · Centre Cultural"],
];
const DIES = ["", "dl", "dt", "dc", "dj", "dv", "ds", "dg"];
const MESOS = ["gen.", "febr.", "març", "abr.", "maig", "juny", "jul.", "ag.", "set.", "oct.", "nov.", "des."];

function dm(d){ return d.slice(8,10) + "/" + d.slice(5,7); }
function dmy(d){ return d ? d.slice(8,10) + "/" + d.slice(5,7) + "/" + d.slice(0,4) : ""; }
function nomMes(m){ return m ? MESOS[Number(m.slice(5,7))-1] + " " + m.slice(0,4) : ""; }
function diaSetmana(d){ const x = new Date(Date.UTC(+d.slice(0,4), +d.slice(5,7)-1, +d.slice(8,10))); return DIES[x.getUTCDay() || 7]; }
function num1(x){ return Math.round(x*10)/10; }

// filas crudas de las pestañas de datos -> modelo limpio
function construirModel(rowsP, rowsS, rowsG, avui){
  const persons = {};
  rowsP.filter(r=>r[0]).forEach(r=>{ let socia={}; try{ socia = r[5] ? JSON.parse(r[5]) : {}; }catch(e){}
    persons[String(r[0])] = {id:String(r[0]), nom:String(r[1]), activa:String(r[2]).toLowerCase()!=="no", des:fmtMonth(r[3]), fins:fmtMonth(r[4]), socia}; });
  const sessions = rowsS.filter(r=>r[0]).map(r=>{
    const date = fmtDate(r[1]); const present = llistaIds(r[3]); const altres = llistaIds(r[4]);
    let font;                                   // llista = lista real · inscrites = reconstruida por cuotas · sense = sin datos
    if (present.length + altres.length === 0) font = "sense";
    else if (date < "2026-01-01" || date >= LLISTES_DIGITALS_DES_DE) font = "llista";
    else font = "inscrites";
    return {id:norm(r[0]), date, grup:String(r[2]||""), present, altres, font};
  }).filter(s=>/^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.date <= avui)
    .sort((a,b)=> a.date.localeCompare(b.date) || a.grup.localeCompare(b.grup));
  const pagos = rowsG.filter(r=>r[0] && String(r[1])!=="__tancat__").map(r=>({mes:fmtMonth(r[0]), pid:String(r[1]), imp:Number(r[2])||0}));
  return {persons, sessions, pagos, avui};
}

function nomDe(m, pid){ return (m.persons[pid] || {nom:pid}).nom; }

// asistencia de cada sesión: lista real = recuento; reconstruida por cuotas = inscritas − 1,5;
// sin ningún dato = la de la sesión con datos más cercana del mismo conjunto (criterio de Mario, 2/11/2026: ninguna sesión a 0)
function assistencies(ses){
  const dir = s => { const n = s.present.length + s.altres.length; if (!n) return null; return s.font==="llista" ? n : Math.max(0, n-FALTES_ESTIMADES); };
  const t = s => Date.UTC(+s.date.slice(0,4), +s.date.slice(5,7)-1, +s.date.slice(8,10));
  const res = new Map();
  ses.forEach(s=>{ let v = dir(s);
    if (v == null){ let bd = Infinity; ses.forEach(o=>{ if (o===s) return; const w = dir(o); if (w==null) return; const dd = Math.abs(t(o)-t(s)); if (dd < bd){ bd = dd; v = w; } }); }
    res.set(s, v); });
  return res;
}

// cifras de una temporada
function estadistiques(t, m){
  const ses = m.sessions.filter(s=>s.date>=t.ini && s.date<=t.fi);
  const pag = m.pagos.filter(p=>p.mes>=t.ini.slice(0,7) && p.mes<=t.fi.slice(0,7));
  const gent = new Set(); ses.forEach(s=>s.present.forEach(p=>gent.add(p))); pag.forEach(p=>gent.add(p.pid));
  const perMes = {}; pag.forEach(p=>{ perMes[p.mes] = (perMes[p.mes]||0) + 1; });
  const llista = ses.filter(s=>s.font==="llista");
  const inscr  = ses.filter(s=>s.font==="inscrites");
  const assist = s => s.present.length + s.altres.length;
  const mitjMesurada = llista.length ? llista.reduce((a,s)=>a+assist(s),0)/llista.length : null;
  const mitjEstimada = inscr.length ? inscr.reduce((a,s)=>a+Math.max(0,assist(s)-FALTES_ESTIMADES),0)/inscr.length : null;
  // media global: real donde hay lista, estimada donde no
  const as = assistencies(ses); const parts = ses.map(s=>as.get(s)).filter(v=>v!=null);
  const mitjana = parts.length ? parts.reduce((a,b)=>a+b,0)/parts.length : null;
  const tipus = !parts.length ? "" : !inscr.length ? "mesurada" : !llista.length ? "estimada" : "mesurada i estimada";
  const ins = Object.values(perMes);
  return {t, ses, pag, gent, perMes, llista, inscr, mitjMesurada, mitjEstimada, mitjana, tipus, as,
          hores: ses.length*HORES_SESSIO, insMin: ins.length?Math.min(...ins):null, insMax: ins.length?Math.max(...ins):null};
}

function fraseDocument(st){
  let f = `${st.t.id} (${st.t.periode}): ${st.ses.length} sessions (${st.hores} h), ${st.gent.size} participants`;
  if (st.mitjana != null) f += `, assistència mitjana d'unes ${Math.round(st.mitjana)} persones per sessió`;
  if (st.insMin != null) f += `, grup estable d'entre ${st.insMin} i ${st.insMax} persones inscrites cada mes`;
  return f + ".";
}

// cuadrícula de asistencia: devuelve valores y tipo de cada columna
function graellaAssistencia(st, m){
  const ses = st.ses.slice().sort((a,b)=> (a.grup?0:1)-(b.grup?0:1) || a.grup.localeCompare(b.grup) || a.date.localeCompare(b.date)); // T1: matí, tarda, sin grupo
  const grupDe = {}; ses.forEach(s=>s.present.forEach(p=>{ grupDe[p] = grupDe[p] || {}; grupDe[p][s.grup||"~"] = (grupDe[p][s.grup||"~"]||0)+1; }));
  const principal = p => { const g = grupDe[p]; if(!g) return "~"; return Object.keys(g).sort((a,b)=>g[b]-g[a])[0]; };
  const ordre = g => g==="~" ? "zzz" : g;
  const pids = [...st.gent].sort((a,b)=> ordre(principal(a)) < ordre(principal(b)) ? -1 : ordre(principal(a)) > ordre(principal(b)) ? 1 : nomDe(m,a).localeCompare(nomDe(m,b),"ca"));
  const files = pids.map(pid=>{
    const cel = ses.map(s=> s.present.includes(pid) ? (s.font==="llista" ? "✓" : "·") : "");
    return [nomDe(m,pid), ...cel, cel.filter(c=>c==="✓").length || ""];
  });
  const as = st.as || assistencies(st.ses);
  const totals = ["Assistents", ...ses.map(s=> as.get(s)==null ? "" : Math.round(as.get(s))), ""];
  const provar = ses.some(s=>s.altres.length) ? ["Venen a provar", ...ses.map(s=>s.altres.length||""), ""] : null;
  return {ses, files, totals, provar,
          cap1: ["", ...ses.map(s=> diaSetmana(s.date) + (s.grup ? " · "+s.grup : "")), ""],
          cap2: ["Participant", ...ses.map(s=>dm(s.date)), "Sessions"]};
}

// cuadrícula de cuotas
function graellaQuotes(st, m){
  const mesos = new Set(Object.keys(st.perMes)); st.ses.forEach(s=>mesos.add(s.date.slice(0,7)));
  const ms = [...mesos].sort();
  const pids = [...new Set(st.pag.map(p=>p.pid))].sort((a,b)=>nomDe(m,a).localeCompare(nomDe(m,b),"ca"));
  const files = pids.map(pid=>{ const cel = ms.map(mm=>{ const p = st.pag.find(x=>x.pid===pid && x.mes===mm); return p ? p.imp : ""; });
    return [nomDe(m,pid), ...cel, cel.reduce((a,b)=>a+(Number(b)||0),0)]; });
  const total = ["Total del mes", ...ms.map(mm=> st.perMes[mm] ? st.pag.filter(p=>p.mes===mm).reduce((a,p)=>a+p.imp,0) : (mm < m.avui.slice(0,7) ? "sense registre" : "")), st.pag.reduce((a,p)=>a+p.imp,0)];
  const persones = ["Persones que paguen", ...ms.map(mm=>st.perMes[mm]||""), ""];
  return {ms, files, total, persones, cap: ["Participant", ...ms.map(nomMes), "Total"]};
}

// tabla de participantes
function taulaParticipants(m, sts){
  const pids = new Set(Object.keys(m.persons)); sts.forEach(st=>st.gent.forEach(p=>pids.add(p)));
  const llista = [...pids].map(pid=>{
    const p = m.persons[pid] || {id:pid, nom:pid, activa:false, des:"", fins:"", socia:{}};
    const ses = m.sessions.filter(s=>s.font==="llista" && s.present.includes(pid)).length;
    const pg = m.pagos.filter(x=>x.pid===pid);
    const soc = Object.keys(p.socia||{}).sort().join(", ");
    return [p.nom, p.activa ? "activa" : "baixa", nomMes(p.des), p.activa ? "" : nomMes(p.fins),
            ...sts.map(st=>st.gent.has(pid) ? "✓" : ""), ses || "", pg.length || "", pg.reduce((a,x)=>a+x.imp,0) || "", soc];
  });
  llista.sort((a,b)=> (a[1]===b[1] ? 0 : a[1]==="activa" ? -1 : 1) || String(a[0]).localeCompare(String(b[0]),"ca"));
  return {cap: ["Participant", "Estat", "Des de", "Fins", ...sts.map(st=>st.t.id), "Sessions amb llista", "Mesos pagats", "Total pagat", "Sòcia"], files: llista};
}

// T1 por grupo: misma temporada, solo las sesiones de ese grupo (y las que no tienen grupo) y quien vino a ellas
function estadistiquesGrup(st, grup){
  const ses = st.ses.filter(s=>s.grup===grup || !s.grup);
  const gent = new Set(); ses.forEach(s=>s.present.forEach(p=>gent.add(p)));
  const llista = ses.filter(s=>s.font==="llista");
  const as = assistencies(ses); const parts = ses.map(s=>as.get(s)).filter(v=>v!=null);
  const mitjana = parts.length ? parts.reduce((a,b)=>a+b,0)/parts.length : null;
  return Object.assign({}, st, {ses, gent, llista, inscr:[], mitjana, as, grup, hores: ses.length*HORES_SESSIO});
}
// ===================== VISTES · 2. DIBUJO DE LAS PESTAÑAS =====================
// actualitzarVistes() rehace todas las pestañas para mirar a partir de las pestañas de datos.

const COL = {negre:"#111111", gris:"#6b6b6b", gris2:"#9a9a9a", linia:"#dcdcdc", suau:"#f3f3f3", marca:"#e4e4e4", blanc:"#ffffff"};
const FONT_TITOL = "Josefin Sans";
const VISTES_OBSOLETES = ["Assistència T1"];   // pestañas de versiones anteriores que se borran solas
const ORDRE_VISTES = ["Inici", "Participants", "Assistència T1 matí", "Assistència T1 tarda", "Assistència T2", "Assistència T3", "Quotes T2", "Quotes T3"];

function vista(nom){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nom);
  if (!sh) sh = ss.insertSheet(nom);
  else {
    sh.getImages().forEach(i=>i.remove());
    sh.setFrozenRows(0); sh.setFrozenColumns(0);
    const r = sh.getRange(1,1,sh.getMaxRows(),sh.getMaxColumns()); r.breakApart(); sh.clear(); sh.setConditionalFormatRules([]);
  }
  sh.setHiddenGridlines(true); sh.setTabColor(COL.negre);
  return sh;
}
function titol(sh, text, sub){
  sh.getRange(1,1).setValue(text).setFontFamily(FONT_TITOL).setFontSize(16).setFontWeight("bold");
  if (sub) sh.getRange(2,1).setValue(sub).setFontColor(COL.gris).setFontSize(10);
}
function capcalera(rang){ rang.setBackground(COL.negre).setFontColor(COL.blanc).setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center").setVerticalAlignment("middle"); }
function seccio(sh, fila, text){ sh.getRange(fila,2).setValue(text.toUpperCase()).setFontFamily(FONT_TITOL).setFontWeight("bold").setFontSize(11).setFontColor(COL.negre); }

// ---------- Inici ----------
function vistaInici(m, sts){
  const sh = vista("Inici");
  sh.setColumnWidth(1, 120); [2,3,4,5,6,7,8,9,10].forEach(c=>sh.setColumnWidth(c, c===3||c===4 ? 170 : 105));
  try { const img = sh.insertImage(LOGO_URL, 1, 1); img.setWidth(96).setHeight(96); } catch(e) {}
  sh.getRange(1,2).setValue("TEATRE DELS RECORDS").setFontFamily(FONT_TITOL).setFontSize(22).setFontWeight("bold");
  sh.getRange(2,2).setValue("Assistència i quotes · Malgrat de Mar").setFontSize(11).setFontColor(COL.gris);
  sh.getRange(3,2).setValue("Un projecte de l'Associació Laboratori Línia de Fuga").setFontSize(9).setFontColor(COL.gris);
  sh.getRange(4,2).setRichTextValue(SpreadsheetApp.newRichTextValue().setText("Obrir la web per passar llista →").setLinkUrl(WEB_URL).build()).setFontSize(10);
  sh.getRange(4,5).setValue("Actualitzat: " + Utilities.formatDate(new Date(), "Europe/Madrid", "dd/MM/yyyy HH:mm")).setFontSize(9).setFontColor(COL.gris);
  sh.setRowHeights(1, 4, 26);

  let f = 6; seccio(sh, f, "Temporades"); f++;
  const cap = ["Temporada","Període","Finançament","Sessions","Hores","Participants","Mitjana per sessió","Inscrites per mes"];
  const files = sts.map(st=>[st.t.id, st.t.periode, st.t.finan, st.ses.length, st.hores, st.gent.size,
                             st.mitjana==null ? "" : num1(st.mitjana), st.insMin==null ? "" : (st.insMin===st.insMax ? st.insMin : st.insMin+"–"+st.insMax)]);
  const totalGent = new Set(); sts.forEach(st=>st.gent.forEach(p=>totalGent.add(p)));
  const total = ["Total", "", "", sts.reduce((a,st)=>a+st.ses.length,0), sts.reduce((a,st)=>a+st.hores,0), totalGent.size, "", ""];
  sh.getRange(f,2,1,cap.length).setValues([cap]); capcalera(sh.getRange(f,2,1,cap.length));
  sh.getRange(f+1,2,files.length,cap.length).setValues(files).setFontSize(10).setVerticalAlignment("middle");
  sh.getRange(f+1,5,files.length+1,5).setHorizontalAlignment("center");
  sh.getRange(f+1+files.length,2,1,cap.length).setValues([total]).setFontWeight("bold").setBackground(COL.suau);
  sh.getRange(f,2,files.length+2,cap.length).setBorder(null,null,true,null,null,true,COL.linia,SpreadsheetApp.BorderStyle.SOLID);
  f += files.length + 3;

  seccio(sh, f, "Peces públiques"); f++;
  const capP = ["Temporada","Peça","Què és","Data","Lloc"];
  sh.getRange(f,2,1,capP.length).setValues([capP]); capcalera(sh.getRange(f,2,1,capP.length));
  const fp = PECES.map(p=>[p[0], p[1], p[2], dmy(p[3]), p[4]]);
  sh.getRange(f+1,2,fp.length,capP.length).setValues(fp).setFontSize(10);
  sh.getRange(f+1,3,fp.length,1).setFontWeight("bold");
  f += fp.length + 2;

  seccio(sh, f, "Per a documents i convocatòries"); f++;
  sts.forEach(st=>{ sh.getRange(f,2,1,8).merge().setValue(fraseDocument(st)).setFontSize(10).setWrap(true); sh.setRowHeight(f, 34); f++; });
  f++;

  seccio(sh, f, "Com llegir aquest document"); f++;
  ["Participants: una fila per persona, amb temporades, sessions i quotes.",
   "Assistència T1, T2, T3: ✓ = ha vingut (llista de la sessió). · = inscrita aquell mes; la sessió no té llista. Columna grisa = sessió sense dades.",
   "Quotes T2, T3: el que ha pagat cada persona cada mes.",
   "Les pestanyes «dades · …» (al final, en gris) les escriu la web. No s'han de tocar a mà.",
   "Aquest document s'actualitza sol cada 10 minuts. Per forçar-ho: menú Teatre dels Records › Actualitzar ara."]
   .forEach(t=>{ sh.getRange(f,2,1,8).merge().setValue(t).setFontSize(9).setFontColor(COL.gris).setWrap(true); f++; });
  return sh;
}

// ---------- Participants ----------
function vistaParticipants(m, sts){
  const sh = vista("Participants");
  titol(sh, "Participants", "Totes les persones que han passat pel Teatre dels Records. Les actives, primer.");
  const t = taulaParticipants(m, sts); const f = 4; const n = t.cap.length;
  sh.getRange(f,1,1,n).setValues([t.cap]); capcalera(sh.getRange(f,1,1,n));
  if (t.files.length){
    sh.getRange(f+1,1,t.files.length,n).setValues(t.files).setFontSize(10);
    sh.getRange(f+1,2,t.files.length,n-1).setHorizontalAlignment("center");
    sh.getRange(f+1,n-1,t.files.length,1).setNumberFormat('#,##0 "€"');
    const bg = t.files.map(r=>Array(n).fill(r[1]==="activa" ? COL.blanc : COL.suau));
    const fc = t.files.map(r=>Array(n).fill(r[1]==="activa" ? COL.negre : COL.gris));
    sh.getRange(f+1,1,t.files.length,n).setBackgrounds(bg).setFontColors(fc);
    sh.getRange(f,1,t.files.length+1,n).setBorder(null,null,true,null,null,true,COL.linia,SpreadsheetApp.BorderStyle.SOLID);
  }
  sh.setColumnWidth(1, 230); for (let c=2;c<=n;c++) sh.setColumnWidth(c, c<=4 ? 90 : 70);
  sh.setColumnWidth(n-3, 110); sh.setColumnWidth(n-2, 90); sh.setColumnWidth(n-1, 90); sh.setColumnWidth(n, 90);
  sh.setFrozenRows(f); sh.setFrozenColumns(1);
  return sh;
}

// ---------- Assistència Tn ----------
function vistaAssistencia(st, m){
  const nomGrup = st.grup ? " " + st.grup : "";
  const sh = vista("Assistència " + st.t.id + nomGrup);
  const g = graellaAssistencia(st, m); const n = g.cap2.length;
  const mitj = st.mitjana==null ? "" : ` · mitjana ${num1(st.mitjana)} per sessió`;
  titol(sh, `Assistència · ${st.t.id}${st.grup ? " · grup de " + (st.grup==="matí" ? "matí" : "tarda") : ""} (${st.t.periode})`, `${st.ses.length} sessions · ${st.gent.size} participants${mitj}`);
  sh.getRange(3,1).setValue("✓ ha vingut   ·  inscrita aquell mes (sessió sense llista)   columna grisa: sessió sense dades").setFontSize(9).setFontColor(COL.gris);
  if (!g.ses.length){ sh.getRange(5,1).setValue("Encara no hi ha sessions en aquesta temporada."); return sh; }
  const f = 5;
  sh.getRange(f,1,2,n).setValues([g.cap1, g.cap2]); capcalera(sh.getRange(f,1,2,n));
  sh.getRange(f,1,2,1).setHorizontalAlignment("left");
  g.ses.forEach((s,i)=>{ if (s.font==="sense") sh.getRange(f,2+i,2,1).setBackground(COL.gris2); else if (s.font==="inscrites") sh.getRange(f,2+i,2,1).setBackground("#4a4a4a"); });
  const nf = g.files.length;
  if (nf){
    sh.getRange(f+2,1,nf,n).setValues(g.files).setFontSize(10);
    sh.getRange(f+2,2,nf,n-1).setHorizontalAlignment("center");
    const bg = g.files.map(r=>r.map((c,j)=> j===0||j===n-1 ? COL.blanc : (g.ses[j-1].font==="sense" ? COL.suau : c==="✓" ? COL.marca : COL.blanc)));
    const fc = g.files.map(r=>r.map(c=> c==="·" ? COL.gris2 : COL.negre));
    sh.getRange(f+2,1,nf,n).setBackgrounds(bg).setFontColors(fc);
    sh.getRange(f+2,n,nf,1).setFontWeight("bold");
  }
  const extra = [g.totals]; if (g.provar) extra.push(g.provar);
  sh.getRange(f+2+nf,1,extra.length,n).setValues(extra).setFontWeight("bold").setBackground(COL.suau).setFontSize(10);
  sh.getRange(f+2+nf,2,extra.length,n-1).setHorizontalAlignment("center");
  sh.getRange(f,1,nf+2+extra.length,n).setBorder(true,true,true,true,true,true,COL.linia,SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(1, 220); for (let c=2;c<n;c++) sh.setColumnWidth(c, 46); sh.setColumnWidth(n, 72);
  sh.setFrozenRows(f+1); sh.setFrozenColumns(1);
  return sh;
}

// ---------- Quotes Tn ----------
function vistaQuotes(st, m){
  const sh = vista("Quotes " + st.t.id);
  const g = graellaQuotes(st, m); const n = g.cap.length;
  titol(sh, `Quotes · ${st.t.id} (${st.t.periode})`, `${g.files.length} persones han pagat alguna quota · total ${g.total[n-1]} €`);
  const f = 4;
  sh.getRange(f,1,1,n).setValues([g.cap]); capcalera(sh.getRange(f,1,1,n)); sh.getRange(f,1).setHorizontalAlignment("left");
  const nf = g.files.length;
  if (nf){
    sh.getRange(f+1,1,nf,n).setValues(g.files).setFontSize(10);
    sh.getRange(f+1,2,nf,n-1).setHorizontalAlignment("center").setNumberFormat('#,##0 "€"');
    sh.getRange(f+1,n,nf,1).setFontWeight("bold");
  }
  sh.getRange(f+1+nf,1,2,n).setValues([g.total, g.persones]).setFontWeight("bold").setBackground(COL.suau).setFontSize(10);
  sh.getRange(f+1+nf,2,1,n-1).setHorizontalAlignment("center").setNumberFormat('#,##0 "€"');
  sh.getRange(f+2+nf,2,1,n-1).setHorizontalAlignment("center");
  sh.getRange(f,1,nf+3,n).setBorder(true,true,true,true,true,true,COL.linia,SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(1, 220); for (let c=2;c<=n;c++) sh.setColumnWidth(c, 80);
  sh.setFrozenRows(f); sh.setFrozenColumns(1);
  return sh;
}

// ---------- Orden, datos en gris ----------
function ordenarPestanyes(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let pos = 1;
  ORDRE_VISTES.forEach(nom=>{ const sh = ss.getSheetByName(nom); if (sh){ ss.setActiveSheet(sh); ss.moveActiveSheet(pos++); } });
  Object.keys(SHEETS).forEach(k=>{
    const sh = sheet(k); ss.setActiveSheet(sh); ss.moveActiveSheet(ss.getNumSheets());
    sh.setTabColor(COL.gris2);
    if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) sh.protect().setDescription("Dades de la web: no tocar a mà").setWarningOnly(true);
  });
  ss.setActiveSheet(ss.getSheetByName("Inici"));
}

// ---------- Entrada principal ----------
function actualitzarVistes(){
  const avui = Utilities.formatDate(new Date(), "Europe/Madrid", "yyyy-MM-dd");
  const m = construirModel(rows("persons"), rows("sessions"), rows("pagos"), avui);
  const sts = TEMPORADES.filter(t=>t.ini <= avui).map(t=>estadistiques(t, m));
  vistaInici(m, sts);
  vistaParticipants(m, sts);
  sts.forEach(st=>{ if (st.t.id === "T1") ["matí","tarda"].forEach(g=>vistaAssistencia(estadistiquesGrup(st, g), m)); else vistaAssistencia(st, m); });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  VISTES_OBSOLETES.forEach(n=>{ const sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });
  sts.filter(st=>st.t.id!=="T1").forEach(st=>vistaQuotes(st, m));
  ordenarPestanyes();
  PropertiesService.getScriptProperties().deleteProperty("vistesPendents");
}

// Lo llama el reloj cada 10 minutos: solo rehace si la web ha guardado algo
function actualitzarSiCal(){
  if (PropertiesService.getScriptProperties().getProperty("vistesPendents")) actualitzarVistes();
}

function onOpen(){
  SpreadsheetApp.getUi().createMenu("Teatre dels Records").addItem("Actualitzar ara", "actualitzarVistes").addToUi();
}

// ===================== INSTAL·LACIÓ (ejecutar UNA vez) =====================
// 1) Copia las pestañas antiguas (las de Emi) a un archivo aparte "Arxiu" y las quita de aquí.
// 2) Borra las sesiones de prueba del 2/11 (y la del 4/11 si está vacía) y el 10/6/2026, que fue la gala
//    The Divas (pieza pública, no sesión de taller).
// 3) Monta las pestañas para mirar.  4) Pone el reloj de cada 10 minutos.
function instalar(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  VISTES_OBSOLETES.forEach(n=>{ const sh = ss.getSheetByName(n); if (sh && ss.getSheets().length > 1) ss.deleteSheet(sh); });
  const propies = ORDRE_VISTES.concat(Object.keys(SHEETS).map(k=>SHEETS[k][0]), Object.keys(SHEETS).map(k=>SHEETS[k][2]));
  Object.keys(SHEETS).forEach(k=>sheet(k)); // renombra las de datos si tenían el nombre antiguo y crea el Registre
  { const sh = sheet("sessions"); sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat("@"); }
  const noms = ss.getSheets().map(sh=>sh.getName()).filter(n=>!propies.includes(n));
  if (noms.length){
    const nomArxiu = "Arxiu · pestanyes originals (Excel d'Emi) · Assistència i quotes TdR";
    let carpeta = null; try { carpeta = DriveApp.getFileById(ss.getId()).getParents().next(); } catch(e) {}
    let arxiu = null;                                   // si un intento anterior ya lo creó, se reutiliza
    if (carpeta){ const it = carpeta.getFilesByName(nomArxiu); if (it.hasNext()) arxiu = SpreadsheetApp.open(it.next()); }
    if (!arxiu){ arxiu = SpreadsheetApp.create(nomArxiu); if (carpeta) try { DriveApp.getFileById(arxiu.getId()).moveTo(carpeta); } catch(e) {} }
    noms.forEach(n=>{ const sh = ss.getSheetByName(n);
      if (sh && !arxiu.getSheetByName(n)) try { sh.copyTo(arxiu).setName(n); } catch(e) { Logger.log("No s'ha pogut copiar «" + n + "»: " + e); } });
    arxiu.getSheets().filter(sh=>!noms.includes(sh.getName())).forEach(sh=>{ if (arxiu.getSheets().length > 1) arxiu.deleteSheet(sh); });
    if (!ss.getSheetByName("Inici")) ss.insertSheet("Inici");  // una hoja tiene que quedar siempre
    SpreadsheetApp.flush();
    noms.forEach(n=>{ const sh = ss.getSheetByName(n);
      if (sh && arxiu.getSheetByName(n)) try { ss.deleteSheet(sh); } catch(e) { Logger.log("No s'ha pogut esborrar «" + n + "»: " + e); } });
    Logger.log("Arxivades a «" + nomArxiu + "»: " + noms.join(", "));
  }
  const shS = sheet("sessions"); const v = shS.getDataRange().getValues();
  for (let i = v.length-1; i >= 1; i--){
    const id = norm(v[i][0]);
    if (id === "2026-11-02" || id === "2026-06-10" || (id === "2026-11-04" && !String(v[i][3]).trim())) shS.deleteRow(i+1);
  }
  actualitzarVistes();
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==="actualitzarSiCal").forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("actualitzarSiCal").timeBased().everyMinutes(10).create();
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==="copiesDeSeguretat").forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("copiesDeSeguretat").timeBased().everyDays(1).atHour(3).create();
  copiesDeSeguretat(true);
  Logger.log("Fet: vistes muntades, rellotge de 10 minuts i còpies de seguretat activats.");
}

// ===================== CÒPIES DE SEGURETAT =====================
// Cada día a las 3 h: si es lunes, copia semanal (se guardan 8); si es día 1, copia mensual (se guardan 12).
// Van a la carpeta "Còpies de seguretat", dentro de la carpeta donde está esta hoja.
const COPIES_SETMANALS = 8, COPIES_MENSUALS = 12;
function copiesDeSeguretat(forcar){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ara = new Date(); const dia = Number(Utilities.formatDate(ara, "Europe/Madrid", "u")); const dm = Number(Utilities.formatDate(ara, "Europe/Madrid", "d"));
  const pare = DriveApp.getFileById(ss.getId()).getParents().next();
  const it = pare.getFoldersByName("Còpies de seguretat"); const carpeta = it.hasNext() ? it.next() : pare.createFolder("Còpies de seguretat");
  const fer = (prefix, data, max)=>{
    const nom = prefix + " · " + data;
    if (!carpeta.getFilesByName(nom).hasNext()) DriveApp.getFileById(ss.getId()).makeCopy(nom, carpeta);
    const totes = []; const f = carpeta.getFiles(); while (f.hasNext()){ const x = f.next(); if (x.getName().indexOf(prefix + " · ") === 0) totes.push(x); }
    totes.sort((a,b)=>b.getName().localeCompare(a.getName())).slice(max).forEach(x=>x.setTrashed(true));
  };
  if (forcar === true || dia === 1) fer("TdR · còpia setmanal", Utilities.formatDate(ara, "Europe/Madrid", "yyyy-MM-dd"), COPIES_SETMANALS);
  if (forcar === true || dm === 1)  fer("TdR · còpia mensual",  Utilities.formatDate(ara, "Europe/Madrid", "yyyy-MM"), COPIES_MENSUALS);
}
// ===== IMPORTACIÓN DEL HISTÓRICO (Excel de Emi, T2 marzo-junio 2026 y T3 sept-oct 2026) =====
// Ejecutar UNA sola vez desde el editor: elegir "importarHistorico" en el desplegable y pulsar Ejecutar.
const HIST_PERSONS = [["angeles-gutierrez", "Ángeles Gutiérrez", "no", "2026-03", "2026-10"], ["pepe-calle", "Pepe Calle", "no", "2026-03", "2026-10"], ["antonia-gutierrez", "Antonia Gutiérrez", "no", "2026-03", "2026-06"], ["teresa-munoz", "Teresa Muñoz", "no", "2026-03", "2026-04"], ["sofia-soto", "Sofía Soto", "no", "2026-03", "2026-05"], ["asun-rodriguez", "Asun Rodríguez", "sí", "2026-09", ""], ["merce-gomez", "Mercè Gómez", "sí", "2026-09", ""], ["marcela-rosa-escobar", "Marcela Rosa Escobar", "sí", "2026-09", ""], ["carmen-perez", "Carmen Pérez", "sí", "2026-09", ""], ["eva-estevez", "Eva Estévez", "sí", "2026-09", ""], ["m-jose-carmona", "M. José Carmona", "sí", "2026-09", ""], ["lola-gomez", "Lola Gómez", "sí", "2026-09", ""], ["leonor-canton", "Leonor Cantón", "sí", "2026-09", ""], ["esther-banos", "Esther Baños", "sí", "2026-09", ""], ["raquel-molina", "Raquel Molina", "sí", "2026-09", ""], ["mirta-edith", "Mirta Edith", "sí", "2026-09", ""], ["rafael-casinave", "Rafael Casinave", "sí", "2026-09", ""], ["imma-barney", "Imma Barney", "sí", "2026-09", ""], ["ana-leon", "Ana León", "sí", "2026-09", ""], ["mary-rodriguez-mary-jo", "Mary Rodríguez (Mary Jo)", "sí", "2026-09", ""]];
const HIST_PAGOS = [["2026-03", "asun-rodriguez", 40, "2026-03-01"], ["2026-03", "merce-gomez", 40, "2026-03-01"], ["2026-03", "marcela-rosa-escobar", 40, "2026-03-01"], ["2026-03", "carmen-perez", 40, "2026-03-01"], ["2026-03", "eva-estevez", 40, "2026-03-01"], ["2026-03", "m-jose-carmona", 40, "2026-03-01"], ["2026-03", "lola-gomez", 40, "2026-03-01"], ["2026-03", "angeles-gutierrez", 40, "2026-03-01"], ["2026-03", "antonia-gutierrez", 40, "2026-03-01"], ["2026-03", "leonor-canton", 40, "2026-03-01"], ["2026-03", "teresa-munoz", 40, "2026-03-01"], ["2026-03", "pepe-calle", 40, "2026-03-01"], ["2026-03", "esther-banos", 40, "2026-03-01"], ["2026-03", "sofia-soto", 20, "2026-03-01"], ["2026-04", "asun-rodriguez", 40, "2026-04-01"], ["2026-04", "merce-gomez", 40, "2026-04-01"], ["2026-04", "marcela-rosa-escobar", 40, "2026-04-01"], ["2026-04", "carmen-perez", 40, "2026-04-01"], ["2026-04", "eva-estevez", 40, "2026-04-01"], ["2026-04", "m-jose-carmona", 40, "2026-04-01"], ["2026-04", "lola-gomez", 40, "2026-04-01"], ["2026-04", "antonia-gutierrez", 40, "2026-04-01"], ["2026-04", "leonor-canton", 40, "2026-04-01"], ["2026-04", "teresa-munoz", 40, "2026-04-01"], ["2026-04", "esther-banos", 40, "2026-04-01"], ["2026-04", "sofia-soto", 40, "2026-04-01"], ["2026-05", "asun-rodriguez", 40, "2026-05-01"], ["2026-05", "merce-gomez", 40, "2026-05-01"], ["2026-05", "marcela-rosa-escobar", 40, "2026-05-01"], ["2026-05", "carmen-perez", 40, "2026-05-01"], ["2026-05", "eva-estevez", 40, "2026-05-01"], ["2026-05", "m-jose-carmona", 40, "2026-05-01"], ["2026-05", "lola-gomez", 40, "2026-05-01"], ["2026-05", "antonia-gutierrez", 40, "2026-05-01"], ["2026-05", "leonor-canton", 40, "2026-05-01"], ["2026-05", "esther-banos", 40, "2026-05-01"], ["2026-05", "sofia-soto", 40, "2026-05-01"], ["2026-05", "raquel-molina", 40, "2026-05-01"], ["2026-06", "asun-rodriguez", 25, "2026-06-01"], ["2026-06", "merce-gomez", 40, "2026-06-01"], ["2026-06", "marcela-rosa-escobar", 25, "2026-06-01"], ["2026-06", "carmen-perez", 40, "2026-06-01"], ["2026-06", "eva-estevez", 40, "2026-06-01"], ["2026-06", "lola-gomez", 25, "2026-06-01"], ["2026-06", "antonia-gutierrez", 25, "2026-06-01"], ["2026-06", "leonor-canton", 25, "2026-06-01"], ["2026-06", "esther-banos", 25, "2026-06-01"], ["2026-06", "raquel-molina", 25, "2026-06-01"], ["2026-09", "asun-rodriguez", 25, "2026-09-01"], ["2026-09", "merce-gomez", 25, "2026-09-01"], ["2026-09", "carmen-perez", 25, "2026-09-01"], ["2026-09", "eva-estevez", 25, "2026-09-01"], ["2026-09", "m-jose-carmona", 25, "2026-09-01"], ["2026-09", "lola-gomez", 25, "2026-09-01"], ["2026-09", "esther-banos", 25, "2026-09-01"], ["2026-09", "raquel-molina", 25, "2026-09-01"], ["2026-09", "mirta-edith", 25, "2026-09-01"], ["2026-09", "rafael-casinave", 25, "2026-09-01"], ["2026-09", "imma-barney", 25, "2026-09-01"], ["2026-10", "asun-rodriguez", 45, "2026-10-01"], ["2026-10", "merce-gomez", 45, "2026-10-01"], ["2026-10", "carmen-perez", 45, "2026-10-01"], ["2026-10", "eva-estevez", 45, "2026-10-01"], ["2026-10", "m-jose-carmona", 45, "2026-10-01"], ["2026-10", "lola-gomez", 45, "2026-10-01"], ["2026-10", "leonor-canton", 45, "2026-10-01"], ["2026-10", "esther-banos", 45, "2026-10-01"], ["2026-10", "raquel-molina", 45, "2026-10-01"], ["2026-10", "marcela-rosa-escobar", 45, "2026-10-01"], ["2026-10", "rafael-casinave", 45, "2026-10-01"], ["2026-10", "imma-barney", 45, "2026-10-01"], ["2026-10", "ana-leon", 45, "2026-10-01"], ["2026-10", "mary-rodriguez-mary-jo", 45, "2026-10-01"], ["2026-10", "mirta-edith", 50, "2026-10-01"]];

// Hojas de asistencia en papel de la T1 (oct–dic 2025), grupos matí y tarda, transcritas el 2/11/2026
const HIST_T1_PERSONS = [["antoni-garofano", "Antoni Garófano Montoro", "no", "2025-10", "2025-12"], ["dolores-sanchez-lola", "Dolores Sánchez Muñoz (Lola)", "no", "2025-10", "2025-12"], ["pilar-davila", "Pilar Dávila", "no", "2025-10", "2025-12"], ["m-pilar-arques", "Mª Pilar Arques", "no", "2025-10", "2025-12"], ["ana-gutierrez", "Ana Gutiérrez", "no", "2025-10", "2025-12"], ["francisca-mora", "Francisca Mora (Francina)", "no", "2025-10", "2025-12"], ["carlos-garcia-sal", "Carlos García Sal", "no", "2025-10", "2025-12"], ["maite-galisteo", "Maite Galisteo", "no", "2025-10", "2025-12"], ["fina-bruguet", "Fina Bruguet", "no", "2025-10", "2025-12"], ["adela-maestre", "Adela Maestre", "no", "2025-10", "2025-12"], ["joaquina-silva", "Joaquina Silva", "no", "2025-10", "2025-12"], ["roser-cuni", "Roser Cuní Martínez", "no", "2025-10", "2025-12"], ["dolors-jubany-lola", "Dolors Jubany (Lola)", "no", "2025-10", "2025-12"], ["josefa-fernandez-bueno", "Josefa Fernández Bueno", "no", "2025-10", "2025-12"], ["genoveva-fornos", "Genoveva Fornos", "no", "2025-10", "2025-12"], ["josefina-alfonso", "Josefina Alfonso", "no", "2025-10", "2025-12"], ["carmen-jimenez", "Carmen Jiménez", "no", "2025-10", "2025-12"], ["adiana-gandara", "Adiana Gándara", "no", "2025-10", "2025-12"], ["ramon-diez", "Ramón Díez", "no", "2025-10", "2025-12"], ["carmen-morales", "Carmen Morales", "no", "2025-10", "2025-12"], ["montse-campillo", "Montse Campillo", "no", "2025-10", "2025-12"], ["maite-alonso", "Maite Alonso", "no", "2025-10", "2025-12"], ["elena-moreno", "Elena Moreno", "no", "2025-10", "2025-12"], ["pepi-leiva", "Pepi Leiva", "no", "2025-10", "2025-12"], ["angela-gomez", "Ángela Gómez", "no", "2025-10", "2025-12"], ["emilia-martin", "Emilia Martín", "no", "2025-10", "2025-12"], ["monica-cernuda", "Mónica Cernuda", "no", "2025-10", "2025-12"]];
const HIST_T1_SESSIONS = [["2025-10-06-m", "2025-10-06", "matí", "antoni-garofano, dolores-sanchez-lola, pilar-davila, marcela-rosa-escobar, antonia-gutierrez, m-pilar-arques, rafael-casinave, carmen-perez, merce-gomez, ana-gutierrez, francisca-mora"], ["2025-10-08-m", "2025-10-08", "matí", "carlos-garcia-sal, dolores-sanchez-lola, pilar-davila, marcela-rosa-escobar, francisca-mora, antonia-gutierrez, rafael-casinave, angeles-gutierrez, carmen-perez, merce-gomez, maite-galisteo"], ["2025-10-13-m", "2025-10-13", "matí", "carlos-garcia-sal, antoni-garofano, dolores-sanchez-lola, pilar-davila, marcela-rosa-escobar, francisca-mora, antonia-gutierrez, rafael-casinave, angeles-gutierrez, carmen-perez, merce-gomez, ana-gutierrez, maite-galisteo"], ["2025-10-15-m", "2025-10-15", "matí", "dolores-sanchez-lola, pilar-davila, marcela-rosa-escobar, francisca-mora, antonia-gutierrez, m-pilar-arques, rafael-casinave, angeles-gutierrez, carmen-perez, merce-gomez, fina-bruguet, maite-galisteo"], ["2025-10-20-m", "2025-10-20", "matí", "ana-gutierrez, angeles-gutierrez, antoni-garofano, carmen-perez, dolores-sanchez-lola, francisca-mora, m-pilar-arques, maite-galisteo, merce-gomez, rafael-casinave, marcela-rosa-escobar"], ["2025-10-22-m", "2025-10-22", "matí", "angeles-gutierrez, antoni-garofano, antonia-gutierrez, carmen-perez, dolores-sanchez-lola, maite-galisteo, merce-gomez, pilar-davila, marcela-rosa-escobar, raquel-molina"], ["2025-10-27-m", "2025-10-27", "matí", "antoni-garofano, antonia-gutierrez, carmen-perez, dolores-sanchez-lola, francisca-mora, m-pilar-arques, maite-galisteo, pilar-davila, rafael-casinave, marcela-rosa-escobar, raquel-molina, adela-maestre"], ["2025-10-29-m", "2025-10-29", "matí", "angeles-gutierrez, antoni-garofano, carmen-perez, dolores-sanchez-lola, francisca-mora, maite-galisteo, rafael-casinave, marcela-rosa-escobar, raquel-molina, adela-maestre"], ["2025-11-03-m", "2025-11-03", "matí", "angeles-gutierrez, antoni-garofano, antonia-gutierrez, dolores-sanchez-lola, merce-gomez, pilar-davila, rafael-casinave, marcela-rosa-escobar, adela-maestre"], ["2025-11-05-m", "2025-11-05", "matí", "angeles-gutierrez, antoni-garofano, antonia-gutierrez, dolores-sanchez-lola, francisca-mora, merce-gomez, pilar-davila, marcela-rosa-escobar, raquel-molina, adela-maestre"], ["2025-11-10-m", "2025-11-10", "matí", "ana-gutierrez, angeles-gutierrez, antoni-garofano, antonia-gutierrez, carmen-perez, francisca-mora, maite-galisteo, merce-gomez, rafael-casinave, adela-maestre"], ["2025-11-12-m", "2025-11-12", "matí", "angeles-gutierrez, antoni-garofano, antonia-gutierrez, carmen-perez, dolores-sanchez-lola, m-pilar-arques, maite-galisteo, merce-gomez, pilar-davila, rafael-casinave, raquel-molina, adela-maestre"], ["2025-11-17-m", "2025-11-17", "matí", "angeles-gutierrez, antonia-gutierrez, carlos-garcia-sal, carmen-perez, dolores-sanchez-lola, m-pilar-arques, maite-galisteo, merce-gomez, pilar-davila, rafael-casinave, raquel-molina, adela-maestre"], ["2025-11-19-m", "2025-11-19", "matí", "angeles-gutierrez, antoni-garofano, antonia-gutierrez, carmen-perez, dolores-sanchez-lola, francisca-mora, maite-galisteo, merce-gomez, pilar-davila, rafael-casinave, adela-maestre"], ["2025-11-24-m", "2025-11-24", "matí", "ana-gutierrez, antoni-garofano, antonia-gutierrez, carlos-garcia-sal, carmen-perez, dolores-sanchez-lola, francisca-mora, maite-galisteo, merce-gomez, pilar-davila, rafael-casinave, marcela-rosa-escobar, raquel-molina"], ["2025-11-26-m", "2025-11-26", "matí", "angeles-gutierrez, antoni-garofano, antonia-gutierrez, carlos-garcia-sal, carmen-perez, dolores-sanchez-lola, francisca-mora, maite-galisteo, pilar-davila, rafael-casinave, marcela-rosa-escobar, raquel-molina, adela-maestre"], ["2025-12-01-m", "2025-12-01", "matí", "antoni-garofano, antonia-gutierrez, carmen-perez, dolores-sanchez-lola, maite-galisteo, merce-gomez, pilar-davila, rafael-casinave, marcela-rosa-escobar, raquel-molina"], ["2025-12-03-m", "2025-12-03", "matí", "angeles-gutierrez, antonia-gutierrez, carlos-garcia-sal, carmen-perez, dolores-sanchez-lola, francisca-mora, maite-galisteo, merce-gomez, rafael-casinave, marcela-rosa-escobar, raquel-molina"], ["2025-10-06-t", "2025-10-06", "tarda", "joaquina-silva, roser-cuni, asun-rodriguez, dolors-jubany-lola, mirta-edith, josefa-fernandez-bueno, genoveva-fornos, josefina-alfonso, carmen-jimenez, adiana-gandara, ramon-diez, carmen-morales, montse-campillo"], ["2025-10-08-t", "2025-10-08", "tarda", "joaquina-silva, roser-cuni, dolors-jubany-lola, mirta-edith, genoveva-fornos, josefina-alfonso, leonor-canton, m-jose-carmona, ramon-diez, carmen-morales, montse-campillo"], ["2025-10-13-t", "2025-10-13", "tarda", "roser-cuni, asun-rodriguez, dolors-jubany-lola, mirta-edith, genoveva-fornos, josefina-alfonso, carmen-jimenez, leonor-canton, m-jose-carmona, ramon-diez, carlos-garcia-sal, fina-bruguet, eva-estevez, maite-alonso, elena-moreno, pepi-leiva"], ["2025-10-15-t", "2025-10-15", "tarda", "roser-cuni, asun-rodriguez, dolors-jubany-lola, josefa-fernandez-bueno, angela-gomez, josefina-alfonso, carmen-jimenez, m-jose-carmona, ramon-diez, montse-campillo, fina-bruguet, eva-estevez, pepi-leiva, elena-moreno, maite-alonso"], ["2025-10-20-t", "2025-10-20", "tarda", "carmen-jimenez, dolors-jubany-lola, elena-moreno, eva-estevez, fina-bruguet, genoveva-fornos, josefa-fernandez-bueno, josefina-alfonso, leonor-canton, asun-rodriguez, m-jose-carmona, mirta-edith, pepi-leiva, ramon-diez, roser-cuni, emilia-martin, lola-gomez"], ["2025-10-22-t", "2025-10-22", "tarda", "carmen-jimenez, dolors-jubany-lola, elena-moreno, eva-estevez, fina-bruguet, genoveva-fornos, josefina-alfonso, leonor-canton, asun-rodriguez, m-jose-carmona, mirta-edith, montse-campillo, ramon-diez, roser-cuni, lola-gomez"], ["2025-10-27-t", "2025-10-27", "tarda", "carmen-jimenez, elena-moreno, eva-estevez, fina-bruguet, genoveva-fornos, josefina-alfonso, leonor-canton, asun-rodriguez, m-jose-carmona, montse-campillo, pepi-leiva, ramon-diez, roser-cuni"], ["2025-10-29-t", "2025-10-29", "tarda", "eva-estevez, asun-rodriguez, maite-alonso, m-jose-carmona, mirta-edith, ramon-diez, roser-cuni, monica-cernuda"], ["2025-11-03-t", "2025-11-03", "tarda", "elena-moreno, eva-estevez, genoveva-fornos, leonor-canton, asun-rodriguez, m-jose-carmona, mirta-edith, montse-campillo, ramon-diez, roser-cuni, emilia-martin, lola-gomez"], ["2025-11-05-t", "2025-11-05", "tarda", "carmen-jimenez, dolors-jubany-lola, elena-moreno, eva-estevez, josefa-fernandez-bueno, josefina-alfonso, asun-rodriguez, maite-alonso, m-jose-carmona, mirta-edith, montse-campillo, ramon-diez, roser-cuni, lola-gomez"], ["2025-11-10-t", "2025-11-10", "tarda", "dolors-jubany-lola, elena-moreno, eva-estevez, fina-bruguet, leonor-canton, asun-rodriguez, maite-alonso, m-jose-carmona, mirta-edith, montse-campillo, ramon-diez, roser-cuni, emilia-martin"], ["2025-11-12-t", "2025-11-12", "tarda", "carmen-jimenez, elena-moreno, eva-estevez, fina-bruguet, josefina-alfonso, leonor-canton, asun-rodriguez, m-jose-carmona, mirta-edith, montse-campillo, pepi-leiva, ramon-diez, roser-cuni"], ["2025-11-17-t", "2025-11-17", "tarda", "dolors-jubany-lola, elena-moreno, eva-estevez, fina-bruguet, leonor-canton, asun-rodriguez, mirta-edith, pepi-leiva, ramon-diez, roser-cuni, emilia-martin"], ["2025-11-19-t", "2025-11-19", "tarda", "carmen-jimenez, elena-moreno, eva-estevez, fina-bruguet, leonor-canton, asun-rodriguez, m-jose-carmona, mirta-edith, montse-campillo, pepi-leiva, ramon-diez, lola-gomez"], ["2025-11-24-t", "2025-11-24", "tarda", "dolors-jubany-lola, elena-moreno, eva-estevez, fina-bruguet, asun-rodriguez, m-jose-carmona, montse-campillo, pepi-leiva, ramon-diez, roser-cuni, emilia-martin, lola-gomez"], ["2025-11-26-t", "2025-11-26", "tarda", "carmen-jimenez, dolors-jubany-lola, elena-moreno, eva-estevez, josefina-alfonso, leonor-canton, asun-rodriguez, maite-alonso, m-jose-carmona, mirta-edith, pepi-leiva, ramon-diez, roser-cuni, lola-gomez"], ["2025-12-01-t", "2025-12-01", "tarda", "dolors-jubany-lola, elena-moreno, eva-estevez, fina-bruguet, leonor-canton, asun-rodriguez, m-jose-carmona, pepi-leiva, ramon-diez, roser-cuni"]];
// Sesiones de la T2 y la T3 reconstruidas: miércoles del calendario; asistentes = quienes pagaron la cuota del mes
const HIST_T23_SESSIONS = [["2026-03-04", "2026-03-04", "", "angeles-gutierrez, antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, pepe-calle, sofia-soto, teresa-munoz", "estimada"], ["2026-03-11", "2026-03-11", "", "angeles-gutierrez, antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, pepe-calle, sofia-soto, teresa-munoz", "estimada"], ["2026-03-18", "2026-03-18", "", "angeles-gutierrez, antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, pepe-calle, sofia-soto, teresa-munoz", "estimada"], ["2026-03-25", "2026-03-25", "", "angeles-gutierrez, antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, pepe-calle, sofia-soto, teresa-munoz", "estimada"], ["2026-04-01", "2026-04-01", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, sofia-soto, teresa-munoz", "estimada"], ["2026-04-08", "2026-04-08", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, sofia-soto, teresa-munoz", "estimada"], ["2026-04-15", "2026-04-15", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, sofia-soto, teresa-munoz", "estimada"], ["2026-04-22", "2026-04-22", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, sofia-soto, teresa-munoz", "estimada"], ["2026-04-29", "2026-04-29", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, sofia-soto, teresa-munoz", "estimada"], ["2026-05-06", "2026-05-06", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, raquel-molina, sofia-soto", "estimada"], ["2026-05-13", "2026-05-13", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, raquel-molina, sofia-soto", "estimada"], ["2026-05-20", "2026-05-20", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, raquel-molina, sofia-soto", "estimada"], ["2026-05-27", "2026-05-27", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, merce-gomez, raquel-molina, sofia-soto", "estimada"], ["2026-06-03", "2026-06-03", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, marcela-rosa-escobar, merce-gomez, raquel-molina", "estimada"], ["2026-06-10", "2026-06-10", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, marcela-rosa-escobar, merce-gomez, raquel-molina", "estimada"], ["2026-06-17", "2026-06-17", "", "antonia-gutierrez, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, leonor-canton, lola-gomez, marcela-rosa-escobar, merce-gomez, raquel-molina", "estimada"], ["2026-09-16", "2026-09-16", "", "asun-rodriguez, carmen-perez, esther-banos, eva-estevez, imma-barney, lola-gomez, m-jose-carmona, merce-gomez, mirta-edith, rafael-casinave, raquel-molina", "estimada"], ["2026-09-23", "2026-09-23", "", "asun-rodriguez, carmen-perez, esther-banos, eva-estevez, imma-barney, lola-gomez, m-jose-carmona, merce-gomez, mirta-edith, rafael-casinave, raquel-molina", "estimada"], ["2026-09-30", "2026-09-30", "", "asun-rodriguez, carmen-perez, esther-banos, eva-estevez, imma-barney, lola-gomez, m-jose-carmona, merce-gomez, mirta-edith, rafael-casinave, raquel-molina", "estimada"], ["2026-10-07", "2026-10-07", "", "ana-leon, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, imma-barney, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, mary-rodriguez-mary-jo, merce-gomez, mirta-edith, rafael-casinave, raquel-molina", "estimada"], ["2026-10-14", "2026-10-14", "", "ana-leon, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, imma-barney, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, mary-rodriguez-mary-jo, merce-gomez, mirta-edith, rafael-casinave, raquel-molina", "estimada"], ["2026-10-21", "2026-10-21", "", "ana-leon, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, imma-barney, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, mary-rodriguez-mary-jo, merce-gomez, mirta-edith, rafael-casinave, raquel-molina", "estimada"], ["2026-10-28", "2026-10-28", "", "ana-leon, asun-rodriguez, carmen-perez, esther-banos, eva-estevez, imma-barney, leonor-canton, lola-gomez, m-jose-carmona, marcela-rosa-escobar, mary-rodriguez-mary-jo, merce-gomez, mirta-edith, rafael-casinave, raquel-molina", "estimada"]];
function importarHistorico(){
  const now = new Date();
  HIST_T1_PERSONS.forEach(p => upsert("persons", [0], [p[0], p[1], p[2], p[3], p[4], "{}", now]));
  HIST_T1_SESSIONS.forEach(s => upsert("sessions", [0], [s[0], s[1], s[2], s[3], "", 0, s[3].split(",").length, now]));
  HIST_T23_SESSIONS.forEach(s => upsert("sessions", [0], [s[0], s[1], s[2], s[3], "", 0, s[3].split(",").length, now]));
  HIST_PERSONS.forEach(p => upsert("persons", [0], [p[0], p[1], p[2], p[3], p[4], "{}", now]));
  HIST_PAGOS.forEach(r => upsert("pagos", [0,1], [r[0], r[1], r[2], r[3], now]));
  Logger.log("Histórico importado: " + (HIST_PERSONS.length+HIST_T1_PERSONS.length) + " personas, " + HIST_PAGOS.length + " pagos y " + HIST_T1_SESSIONS.length + " sesiones de la T1 y " + HIST_T23_SESSIONS.length + " de la T2-T3.");
}
