// ===== 7. ARRANQUE y refresco =====
// Al abrir: se pintan al instante los datos de la última vez (guardados en el móvil) y, en cuanto llegan los de la
// hoja, se actualizan sin tocar lo que se esté marcando.
let refreshing=false;
function repintar(){
  if(vistaActual==="lista"){ if(!listaTocada()) setDate($("l-date").value||todayISO(), curSessionId); else { renderQuotaBar(quotaInfo()); lineaGuardada(); } }
  if(vistaActual==="pagos" && !hayBorradorPagos()) renderPagos();
  if(vistaActual==="hist") renderHistorial();
  if(vistaActual==="pers" && !document.querySelector('#n-list .ficha[data-datos="1"]')) renderPersons();
  if(vistaActual==="res") renderSummary();
  updPendientes();
}
async function refresh(){
  if(!store || refreshing || store.name==="local") return; refreshing=true; updPendientes();
  try{ data=await store.load(); repintar(); }catch(e){} refreshing=false; updPendientes();
}
// Al volver a la página otro día (p. ej. quedó abierta en el móvil), Lista salta sola a la fecha de hoy
let shownDay=null;
function syncToday(){ const t=todayISO(); if(shownDay && shownDay!==t && !listaTocada()){ curSessionId=null; setDate(t); } shownDay=t; }
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"){ syncToday(); refresh(); } });
window.addEventListener("focus",syncToday); setInterval(syncToday,60000);
// con cobertura débil el móvil no siempre avisa de que vuelve la red: cada minuto se reintenta lo pendiente
setInterval(()=>{ if(store && store.pending().length) store.retry(); },60000);
window.addEventListener("online",async()=>{ if(store){ await store.retry(); refresh(); } });

(async()=>{
  $("ver").textContent="v. "+APP_VERSION;
  { const s=SEASONS.find(s=>s.id===curSeasonKey()); $("h-season").textContent="Temporada "+(s&&s.years?s.years:curSeasonKey()); }
  store=await pickStore();
  store.onChange=()=>{ updPendientes(); if(vistaActual==="hist") renderHistorial(); };
  store.onResult=(op,res)=>{ if(!res) return; // resultados que llegan más tarde (cola que se vacía sola)
    if(op.action==="deleteSession"){ delete data.sessions[op.data.id]; return; }
    if(res.session && (!data.sessions[res.session.id] || store.pending().some(o=>o.key==="d:"+res.session.id))) return; // ya borrada aquí
    if(res.session) data.sessions[res.session.id]=res.session; if(res.pagos) data.pagos[res.pagos.month]={month:res.pagos.month,rows:res.pagos.rows}; if(res.person) data.persons[res.person.id]=res.person; };
  const cache=store.cached();
  if(cache){ data=cache; store.pending().forEach(op=>aplicarOp(data,op)); setDate(todayISO()); shownDay=todayISO(); updPendientes(); }
  else banner("Cargando datos…");
  refreshing=true; updPendientes();
  try{ data=await store.load(); refreshing=false; banner(""); if(cache) repintar(); else { setDate(todayISO()); shownDay=todayISO(); } updPendientes(); }
  catch(e){ refreshing=false; updPendientes(); if(!cache){ banner("No se han podido cargar los datos. Comprueba la conexión y recarga.","err"); setDate(todayISO()); } else updPendientes(); }
  if(store.name==="local") banner("Esta copia guarda solo en este dispositivo. No está conectada a la hoja del Drive.","err");
})();

// ===== Versión nueva de la web: el móvil guarda la página hasta 10 minutos. Al abrirla o volver a ella se mira
// si hay una versión más nueva y, si la hay, se carga sola (lo marcado sin guardar está en el borrador del móvil).
async function mirarVersionNueva(){
  if(location.protocol!=="https:" || !/github\.io$/.test(location.hostname)) return;
  try{
    const t=await (await fetch(location.pathname+"?comprobar="+Date.now(),{cache:"no-store"})).text();
    const v=(t.match(/const APP_VERSION = "([^"]+)"/)||[])[1];
    if(v && v!==APP_VERSION && !/\{\{/.test(v)){ saveDraft(); location.replace(location.pathname+"?v="+encodeURIComponent(v)); }
  }catch(e){}
}
mirarVersionNueva();
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") mirarVersionNueva(); });
