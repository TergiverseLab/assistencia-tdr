// ===== 1. BASE: utilidades, temporadas, navegación, botón Guardar =====
const APP_VERSION = "{{VERSION}}";
const SOCIA_AMOUNT = 30;            // cuota anual de socia de la asociación (acta 26-10-2026)
const DEFAULT_AMOUNT = 45;          // cuota mensual habitual (septiembre fue 25)
const $ = id => document.getElementById(id);
const defAmount = () => Number($("p-default").value)||DEFAULT_AMOUNT;
const todayISO = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const fmt = iso => { const [y,m,d]=String(iso).slice(0,10).split("-"); return `${d}/${m}/${y}`; };
const MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const monthName = ym => { const [y,m]=ym.split("-"); return `${MESES[+m-1]} ${y}`; };
const shortMonth = ym => { const [y,m]=ym.split("-"); return MESES[+m-1].slice(0,3)+" "+y.slice(2); };
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hora = t => { if(!t) return ""; const d=new Date(t); if(isNaN(d)) return ""; return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")} a las ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };

let store=null, data={persons:{},sessions:{},pagos:{},settings:{},registre:[]};
const asocOn = () => !!(data.settings && data.settings.asociacion);
function setStatus(id,txt,cls){ const el=$(id); if(!el) return; el.textContent=txt; el.className="status"+(cls?" "+cls:""); }

// Temporadas reales del Teatre dels Records. Las posteriores se calculan solas (septiembre a agosto).
const SEASONS=[{id:"T1",label:"T1 · oct–des 2025",from:"2025-10",to:"2026-01"},{id:"T2",label:"T2 · febr–juny 2026",from:"2026-02",to:"2026-08"},{id:"T3",label:"T3 · 2026-27",from:"2026-09",to:"2027-08",years:"2026-27"}];
function seasonOf(ym){ const s=SEASONS.find(s=>ym>=s.from&&ym<=s.to); if(s) return s.id; const [y,m]=ym.split("-").map(Number); const st=m>=9?y:y-1; return `${st}-${String(st+1).slice(2)}`; }
const seasonLabel = id => id==="all" ? "Todas las temporadas" : (SEASONS.find(s=>s.id===id)||{label:"Temporada "+id}).label;
const curSeasonKey = () => seasonOf(todayISO().slice(0,7));
const sesSeason = k => seasonOf((data.sessions[k].date||k).slice(0,7));
const sesGroup = k => data.sessions[k].group || "";
const isSocia = (p,season) => !!(p.socia && p.socia[season]);
function activePersons(){ return Object.values(data.persons).filter(p=>p.active!==false).sort((a,b)=>a.name.localeCompare(b.name,"es")); }

// Asistencia: listas reales en la T1 (papel) y desde el 4/11/2026 (web). Entre medias, las sesiones se reconstruyeron por
// cuotas: inscritas − 1,5 (nunca faltaban más de 3; criterio de Mario, 2/11/2026). Ninguna sesión sale a 0: las que no
// tienen datos toman la asistencia de la sesión con datos más cercana de su temporada. Igual que en la hoja.
const LISTAS_WEB_DESDE="2026-11-01";  // desde aquí cada sesión se registra en la web: cuenta lo que pone, aunque sea 0
const sesConLista = k => { const s=data.sessions[k]; const d=s.date||k; return d>=LISTAS_WEB_DESDE || (d<"2026-01-01" && s.present.length+(s.others||[]).length>0); };
// Solo las sesiones ANTIGUAS sin datos (antes de usar la web) toman la cifra de la sesión más cercana.
// Las registradas con la web cuentan exactamente lo que pone, aunque sea 0.
const sesAsisDirecta = k => { const s=data.sessions[k]; const d=s.date||k; const n=s.present.length+(s.others||[]).length; if(d>=LISTAS_WEB_DESDE) return n; if(!n) return null; return sesConLista(k) ? n : Math.max(0,n-1.5); };
// grupo: si se está mirando un grupo (T1 matí / T1 tarda), la estimación sale de las sesiones de ese grupo, como en la hoja
const sesAsistencia = (k, grupo) => { const v=sesAsisDirecta(k); if(v!=null) return v;
  const d0=Date.parse((data.sessions[k].date||k)+"T12:00:00"); const se=sesSeason(k); let best=null, bd=Infinity;
  Object.keys(data.sessions).forEach(j=>{ if(j===k||sesSeason(j)!==se) return; if(grupo && grupo!=="all" && data.sessions[j].group && data.sessions[j].group!==grupo) return; const w=sesAsisDirecta(j); if(w==null) return; const dd=Math.abs(Date.parse((data.sessions[j].date||j)+"T12:00:00")-d0); if(dd<bd){ bd=dd; best=w; } });
  return best; };

// Bloqueo: lo pasado se ve cerrado. "Desbloquear para corregir" abre SOLO en este móvil y al instante; al guardar se vuelve a cerrar.
const abiertos=new Set();
const mesTancat = month => !!(data.settings && data.settings["tancat:"+month]===true);   // cerrado a mano con "Cerrar mes"
const isLocked = month => !abiertos.has("m:"+month) && (month<todayISO().slice(0,7) || mesTancat(month));
// Una sesión YA REGISTRADA (de cualquier día) queda cerrada: para cambiarla, "Corregir registro". Una nueva se marca directamente.
const isSesLocked = sid => { const s=sid?data.sessions[sid]:null; if(!s) return false; return !abiertos.has("s:"+sid); };

// ---------- navegación ----------
const views=["lista","pagos","hist","pers","res"];
let vistaActual="lista";
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>show(b.dataset.view)));
function show(v){
  vistaActual=v;
  document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.view===v)));
  views.forEach(k=>$("view-"+k).hidden = k!==v);
  $("savebar").hidden = !(v==="lista"||v==="pagos");
  clearTimeout(flashT); flashOn=false; botonGuardar();
  if(v==="lista"){ if(!listaTocada()) setDate($("l-date").value, curSessionId); else applySesLock(); }
  if(v==="pagos") renderPagos();
  if(v==="hist") renderHistorial();
  if(v==="pers") renderPersons();
  if(v==="res") renderSummary();
  if(v!=="lista") refresh();
  window.scrollTo(0,0);
}

// ---------- botón Guardar: "Guardando…" al instante, bloqueado hasta terminar ----------
let guardando=false, flashT=null, flashOn=false;
const etiquetaGuardar = () => vistaActual==="pagos" ? "Guardar cuotas" : "Guardar asistencia";
function botonGuardar(){ const b=$("save"); if(guardando||flashOn) return; b.classList.remove("saved","failed","busy"); b.textContent=etiquetaGuardar();
  b.disabled = vistaActual==="lista" ? isSesLocked(curSessionId) : vistaActual==="pagos" ? isLocked(curMonth) : false; }
function botonEstado(estado,txt){ const b=$("save"); clearTimeout(flashT); b.classList.remove("saved","failed","busy");
  if(estado==="busy"){ guardando=true; b.disabled=true; b.classList.add("busy"); b.textContent="Guardando…"; return; }
  guardando=false; flashOn=true; b.disabled=false; b.classList.add(estado==="ok"?"saved":"failed"); b.textContent=txt;
  flashT=setTimeout(()=>{ flashOn=false; botonGuardar(); },2500); }
$("save").addEventListener("click",()=>{ if(guardando) return; if(vistaActual==="lista") saveSession(); else if(vistaActual==="pagos") savePagos(); });

// ---------- avisos de cambios pendientes de subir ----------
// Aviso de cambios esperando: SOLO si un envío ha fallado de verdad (sin internet o puente antiguo).
// Mientras se está enviando, solo la barrita de carga de arriba ("Guardando en la hoja…").
function updPendientes(){
  const n = store && store.pending ? store.pending().length : 0; const b=$("banner");
  const enviando = !!(store && store.enviando && store.enviando()) || (typeof refreshing!=="undefined" && refreshing);
  $("carga").hidden = !enviando;
  if(n && !enviando && store.motivo){ b.hidden=false; b.className="banner warn"; b.innerHTML=`${esc(textoEspera())} <button class="btn ghost small" type="button" id="b-retry">Reintentar ahora</button>`;
    $("b-retry").onclick=async()=>{ $("b-retry").disabled=true; await store.retry(); updPendientes(); }; }
  else if(b.classList.contains("warn")){ b.hidden=true; b.className="banner"; b.textContent=""; }
}
function banner(txt,cls){ const b=$("banner"); if(b.classList.contains("warn")&&!txt) return; b.hidden=!txt; b.className="banner"+(cls?" "+cls:""); b.textContent=txt||""; }

// Confirmación dentro de la página (sin ventanas emergentes): sustituye una fila por la pregunta y dos botones
// peligro=true (eliminar, dar de baja): aviso resaltado y el botón destacado es "No"
function confirmar(fila, texto, si, alSi, peligro){
  const box=document.createElement("div"); box.className="confirm"+(peligro?" danger":""); box.setAttribute("role","alertdialog");
  box.innerHTML = peligro
    ? `<p><b>${esc(texto)}</b></p><div class="row"><button class="btn small no" type="button">No</button><button class="btn ghost small si" type="button">${esc(si)}</button></div>`
    : `<p>${esc(texto)}</p><div class="row"><button class="btn small si" type="button">${esc(si)}</button><button class="btn ghost small no" type="button">No</button></div>`;
  fila.hidden=true; fila.after(box);
  const bSi=box.querySelector(".si"), bNo=box.querySelector(".no"); const cerrar=()=>{ box.remove(); fila.hidden=false; };
  bNo.onclick=cerrar; bSi.onclick=()=>{ cerrar(); alSi(); }; (peligro?bNo:bSi).focus();
}

// Por qué hay cambios esperando: sin internet, o la hoja todavía tiene el puente antiguo. Lo guardado no se pierde.
function textoEspera(){
  return store && store.motivo==="puente"
    ? "La hoja todavía tiene el puente antiguo: falta publicar la nueva versión (Implementar › Gestionar implementaciones › Nueva versión). Lo guardado no se pierde: subirá en cuanto esté."
    : "Sin conexión. La información se actualizará cuando vuelvas a tener conexión.";
}
const textoEsperaCorto = () => store && store.motivo==="puente" ? "Pendiente: falta actualizar el puente de la hoja" : "Sin conexión";

// Desde cuándo viene alguien: la primera sesión en la que consta o el primer mes que pagó (no el campo "alta",
// que en las importaciones quedó con la fecha de la importación). Devuelve "AAAA-MM" o "".
function desdeCuando(pid){
  let min="";
  Object.keys(data.sessions).forEach(k=>{ const s=data.sessions[k]; if(s.present.includes(pid)){ const m=(s.date||k).slice(0,7); if(!min||m<min) min=m; } });
  Object.keys(data.pagos).forEach(m=>{ if((data.pagos[m].rows||{})[pid] && (!min||m<min)) min=m; });
  const p=data.persons[pid]; if(p&&p.from&&(!min||p.from<min)) min=p.from;
  return min;
}
const textoDesde = pid => { const m=desdeCuando(pid); return m ? `en el taller desde ${monthName(m)} (${seasonOf(m)})` : ""; };
