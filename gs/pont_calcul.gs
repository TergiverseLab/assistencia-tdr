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
