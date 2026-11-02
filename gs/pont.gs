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
