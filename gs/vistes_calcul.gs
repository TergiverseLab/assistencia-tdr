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
function llistaIds(v){ return String(v==null?"":v).split(",").map(s=>s.trim()).filter(Boolean); }
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
  const parts = []; llista.forEach(s=>parts.push(assist(s))); inscr.forEach(s=>parts.push(Math.max(0,assist(s)-FALTES_ESTIMADES)));
  const mitjana = parts.length ? parts.reduce((a,b)=>a+b,0)/parts.length : null;
  const tipus = !parts.length ? "" : !inscr.length ? "mesurada" : !llista.length ? "estimada" : "mesurada i estimada";
  const ins = Object.values(perMes);
  return {t, ses, pag, gent, perMes, llista, inscr, mitjMesurada, mitjEstimada, mitjana, tipus,
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
  const totals = ["Assistents", ...ses.map(s=> s.font==="llista" ? s.present.length+s.altres.length : s.font==="inscrites" ? Math.round(Math.max(0,s.present.length+s.altres.length-FALTES_ESTIMADES)) : ""), ""];
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
  const mitjana = llista.length ? llista.reduce((a,s)=>a+s.present.length+s.altres.length,0)/llista.length : null;
  return Object.assign({}, st, {ses, gent, llista, inscr:[], mitjana, grup, hores: ses.length*HORES_SESSIO});
}
