// ===== 7. ARRANQUE y refresco =====
// Al abrir: se pintan al instante los datos de la última vez (guardados en el móvil) y, en cuanto llegan los de la
// hoja, se actualizan sin tocar lo que se esté marcando.
let refreshing=false;
function repintar(){
  if(vistaActual==="lista"){ if(!listaTocada()) setDate($("l-date").value||todayISO(), curSessionId); else { renderQuotaBar(quotaInfo()); lineaGuardada(); } }
  if(vistaActual==="pagos" && !hayBorradorPagos()) renderPagos();
  if(vistaActual==="hist") renderHistorial();
  if(vistaActual==="pers") renderPersons();
  if(vistaActual==="res") renderSummary();
  updPendientes();
}
async function refresh(){
  if(!store || refreshing || store.name==="local") return; refreshing=true;
  try{ data=await store.load(); repintar(); }catch(e){} refreshing=false;
}
// Al volver a la página otro día (p. ej. quedó abierta en el móvil), Lista salta sola a la fecha de hoy
let shownDay=null;
function syncToday(){ const t=todayISO(); if(shownDay && shownDay!==t && !listaTocada()){ curSessionId=null; setDate(t); } shownDay=t; }
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"){ syncToday(); refresh(); } });
window.addEventListener("focus",syncToday); setInterval(syncToday,60000);
window.addEventListener("online",async()=>{ if(store){ await store.retry(); refresh(); } });

(async()=>{
  $("ver").textContent="v. "+APP_VERSION;
  { const s=SEASONS.find(s=>s.id===curSeasonKey()); $("h-season").textContent="Temporada "+(s&&s.years?s.years:curSeasonKey()); }
  store=await pickStore();
  store.onChange=()=>{ updPendientes(); if(vistaActual==="hist") renderHistorial(); };
  store.onResult=(op,res)=>{ if(!res) return; // resultados que llegan más tarde (cola que se vacía sola)
    if(res.session) data.sessions[res.session.id]=res.session; if(res.pagos) data.pagos[res.pagos.month]={month:res.pagos.month,rows:res.pagos.rows}; if(res.person) data.persons[res.person.id]=res.person; };
  const cache=store.cached();
  if(cache){ data=cache; store.pending().forEach(op=>aplicarOp(data,op)); setDate(todayISO()); shownDay=todayISO(); updPendientes(); }
  else banner("Cargando datos…");
  try{ data=await store.load(); banner(""); if(cache) repintar(); else { setDate(todayISO()); shownDay=todayISO(); } updPendientes(); }
  catch(e){ if(!cache){ banner("No se han podido cargar los datos. Comprueba la conexión y recarga.","err"); setDate(todayISO()); } else updPendientes(); }
  if(store.name==="local") banner("Esta copia guarda solo en este dispositivo. No está conectada a la hoja del Drive.","err");
})();
