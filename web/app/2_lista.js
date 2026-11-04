// ===== 2. LISTA =====
// La sesión se identifica por su id (fecha; en la T1, fecha-grupo). Al guardar se mandan SOLO los cambios respecto
// a lo que se cargó en pantalla (base): quién se ha marcado y quién se ha desmarcado. Así, si Emi y Mario pasan lista
// a la vez, se suman las dos listas en vez de pisarse.
let curSessionId=null;
let baseSes={id:null, present:[], others:[]};   // lo que había en la hoja cuando se pintó la lista
function sessionsOn(date){ return Object.keys(data.sessions).filter(k=>(data.sessions[k].date||k)===date).sort(); }
function rosterFor(sid,date){
  const s=sid?data.sessions[sid]:null;
  if(!s) return activePersons();
  const season=seasonOf(date.slice(0,7)); const grp=sesGroup(sid); const ids=new Set(s.present);
  Object.keys(data.sessions).forEach(k=>{ if(sesSeason(k)===season && sesGroup(k)===grp) data.sessions[k].present.forEach(pid=>ids.add(pid)); });
  if(season===curSeasonKey()) activePersons().forEach(p=>ids.add(p.id));
  return [...ids].map(id=>data.persons[id]||{id,name:id,active:false}).sort((a,b)=>a.name.localeCompare(b.name,"es"));
}
function renderRoster(){
  // se conserva lo marcado en pantalla: si no, dar de alta/baja o renombrar a alguien desde Personas vaciaba la lista
  // y el siguiente "Guardar cambios" quitaba a todo el mundo de la hoja (corregido 4/11/2026)
  const box=$("l-roster"); const keep=new Set([...box.querySelectorAll("input:checked")].map(c=>c.value)); box.innerHTML=""; const q=quotaInfo();
  const bloq=isSesLocked(curSessionId);
  rosterFor(curSessionId,$("l-date").value).forEach(p=>{
    const l=document.createElement("label"); l.className="p";
    const c=document.createElement("input"); c.type="checkbox"; c.value=p.id; c.checked=keep.has(p.id); c.disabled=bloq; if(c.checked) l.classList.add("on");
    c.addEventListener("change",()=>{ l.classList.toggle("on",c.checked); updCount(); saveDraft(); });
    l.append(c,document.createTextNode(p.name));
    if(p.active===false){ const m=document.createElement("span"); m.className="pend"; m.style.color="var(--muted)"; m.textContent="baja"; l.append(m); }
    if(asocOn() && p.active!==false && !isSocia(p,curSeasonKey())){ const m=document.createElement("span"); m.className="pend"; m.textContent="socia pendiente"; l.append(m); }
    if(q && p.active!==false && !q.rows[p.id]){ const m=document.createElement("span"); m.className="quota"; m.textContent="cuota"; m.title="Cuota de "+monthName(q.ym)+" pendiente"; l.append(m); }
    box.append(l);
  });
  renderQuotaBar(q); updCount();
}
// Cuotas en la lista de asistencia: QUITADO (2/11/2026, Mario: no se entiende). La lista solo dice quién ha venido;
// las cuotas se miran en Cuotas. Se deja la función devolviendo null para no tocar el resto.
function quotaInfo(){ return null; }
function quotaInfoAntes(){
  const ym=($("l-date").value||todayISO()).slice(0,7); if(seasonOf(ym)==="T1") return null;
  const pg=data.pagos[ym]; const rows=(pg&&pg.rows)||{}; if(!Object.keys(rows).length) return null;
  return {ym, rows};
}
function renderQuotaBar(q){
  const box=$("l-quota"); if(!q){ box.hidden=true; return; }
  const act=activePersons(); const paid=act.filter(p=>q.rows[p.id]).length; const pend=act.length-paid;
  box.hidden=false;
  box.innerHTML=`<span class="qtxt">Cuota de ${esc(monthName(q.ym))}</span><span class="qbar" aria-hidden="true"><i style="width:${act.length?Math.round(100*paid/act.length):0}%"></i></span><span class="qnum">${paid}/${act.length}</span>`;
  box.setAttribute("aria-label",`Cuota de ${monthName(q.ym)}: ${paid} de ${act.length} pagadas${pend?", "+pend+" pendientes":""}. Toca para ir a Pagos.`);
  box.onclick=()=>{ curMonth=q.ym; show("pagos"); };
}
const checked=()=>[...$("l-roster").querySelectorAll("input:checked")].map(c=>c.value);
const others=()=>$("l-others").value.split(",").map(s=>s.trim()).filter(Boolean);
// Un solo botón: "Marcar todas" o, si ya están todas, "Desmarcar todas"
function todasMarcadas(){ const c=[...$("l-roster").querySelectorAll("input")]; return c.length>0 && c.every(x=>x.checked); }
function updCount(){ $("l-count").textContent=checked().length+others().length; $("l-all").textContent = todasMarcadas() ? "Desmarcar todas" : "Marcar todas"; }
function marcar(ids,otros){ $("l-roster").querySelectorAll("input").forEach(c=>{ c.checked=ids.includes(c.value); c.parentElement.classList.toggle("on",c.checked); }); $("l-others").value=(otros||[]).join(", "); updCount(); }
// ¿hay cambios en pantalla sin guardar?
const bajo=a=>a.map(x=>x.toLowerCase()).sort().join(",");
function listaTocada(){ return checked().slice().sort().join()!==baseSes.present.slice().sort().join() || bajo(others())!==bajo(baseSes.others||[]); }

// Borrador: lo marcado se guarda en el móvil al instante y se recupera si se recarga antes de pulsar Guardar
const draftKey=()=>"tdr-draft-"+(curSessionId||$("l-date").value||""); // misma clave antes y después de que exista la sesión
function saveDraft(){ try{ if(listaTocada()) localStorage.setItem(draftKey(),JSON.stringify({present:checked(),others:$("l-others").value,base:baseSes.present,baseOthers:baseSes.others,t:Date.now()})); else localStorage.removeItem(draftKey()); }catch(e){} }
function clearDraft(k){ try{ localStorage.removeItem(k||draftKey()); }catch(e){} }
function readDraft(){ try{ return JSON.parse(localStorage.getItem(draftKey())||"null"); }catch(e){ return null; } }
function applyDraft(){
  const d=readDraft(); if(!d) return false;
  baseSes={id:curSessionId, present:d.base||[], others:d.baseOthers||[]};
  marcar(d.present, String(d.others||"").split(",").map(s=>s.trim()).filter(Boolean));
  setStatus("l-status","Recuperado lo que tenías marcado sin guardar. Pulsa Guardar cuando termines.","ok"); return true;
}
$("l-others").addEventListener("input",()=>{ updCount(); saveDraft(); });
$("l-all").addEventListener("click",()=>{ const on=!todasMarcadas(); $("l-roster").querySelectorAll("input").forEach(c=>{c.checked=on;c.parentElement.classList.toggle("on",on);}); updCount(); saveDraft(); });
$("l-clear").addEventListener("click",()=>{ $("l-roster").querySelectorAll("input").forEach(c=>{c.checked=false;c.parentElement.classList.remove("on");}); $("l-others").value=""; updCount(); saveDraft(); setStatus("l-status",""); });

function setDate(iso, sid){
  document.querySelectorAll("#view-lista .confirm").forEach(c=>{ c.remove(); }); ["l-lockrow","l-acciones"].forEach(id=>{ if($(id)) $(id).hidden=false; });
  $("l-date").value=iso; const d=new Date(iso+"T12:00:00");
  $("l-dayname").innerHTML=`<span>${esc(DIAS[d.getDay()]||"")} ${esc(fmt(iso))}</span><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;
  const found=sessionsOn(iso); const grouped=found.filter(k=>data.sessions[k].group);
  curSessionId = (sid && data.sessions[sid]) ? sid : (found.length ? found[0] : null);
  $("l-grouprow").hidden=grouped.length===0;
  if(grouped.length){ $("l-group").innerHTML=grouped.map(k=>`<option value="${esc(k)}">grup ${esc(sesGroup(k))}</option>`).join(""); $("l-group").value=curSessionId; }
  renderRoster(); loadSession(curSessionId);
  if(curSessionId && isSesLocked(curSessionId) && readDraft()) abiertos.add("s:"+curSessionId);   // había cambios a medias: se sigue corrigiendo
  applySesLock(); if(!isSesLocked(curSessionId)) applyDraft();
}
function loadSession(id){
  const s=id?data.sessions[id]:null;
  baseSes={id, present:s?s.present.slice():[], others:s?(s.others||[]).slice():[]};
  marcar(s?s.present:[], s?s.others:[]); setStatus("l-status",""); lineaGuardada();
}
function lineaGuardada(estado){
  const el=$("l-saved"); const s=curSessionId&&data.sessions[curSessionId];
  if(estado==="cola"){ el.textContent=textoEspera(); el.className="saved warn"; return; }
  if(estado==="busy"){ el.textContent="Guardando…"; el.className="saved"; return; }
  if(estado==="subiendo"){ el.textContent="Guardada · subiendo a la hoja…"; el.className="saved ok"; return; }
  if(s && abiertos.has("s:"+curSessionId)){ el.innerHTML=`${CANDADO_ABIERTO}<b>Corrigiendo</b>`; el.className="saved reg"; }
  else if(s){ el.innerHTML=`${CANDADO}<b>Registrada</b>${s.savedAt?" · "+esc(hora(s.savedAt)):""}`; el.className="saved reg"; }
  else { el.textContent="Sesión nueva: todavía no se ha guardado."; el.className="saved"; }
}
function applySesLock(){
  const sid=curSessionId; const has=!!(sid&&data.sessions[sid]); const locked=isSesLocked(sid);
  const past = has;   // cualquier sesión registrada tiene sus dos opciones: Corregir y Eliminar
  // Arriba, para una sesión ya registrada: [Corregir registro] (las pasadas) y [Eliminar registro]
  $("l-lockrow").hidden=!has; $("l-lock").hidden=!past;
  $("l-lock").textContent = locked ? "Corregir registro" : "Cancelar corrección";
  $("l-info").textContent = past && !locked ? "Cambia lo que haga falta y pulsa Guardar." : ""; lineaGuardada();
  $("l-info").hidden = !$("l-info").textContent;
  $("l-roster").querySelectorAll("input").forEach(c=>c.disabled=locked); $("l-others").disabled=locked; $("l-all").disabled=locked; $("l-clear").disabled=locked;
  if(vistaActual==="lista") botonGuardar();
}
$("l-lock").addEventListener("click",()=>{
  if(!curSessionId) return; const k="s:"+curSessionId;
  if(isSesLocked(curSessionId)) confirmar($("l-lockrow"), "¿Corregir el registro de esta sesión?", "Sí, corregir", ()=>{
    cortarFlash(); abiertos.add(k); applySesLock(); setStatus("l-status",""); });
  else { const cerrar=()=>{ cortarFlash(); abiertos.delete(k); loadSession(curSessionId); clearDraft(); applySesLock(); setStatus("l-status","Corrección cancelada: el registro queda como estaba.","ok"); };
    if(listaTocada()) confirmar($("l-lockrow"), "Hay cambios sin guardar. ¿Cancelar y descartarlos?", "Sí, descartar", cerrar); else cerrar(); }
});
$("l-group").addEventListener("change",()=>{ setDate($("l-date").value, $("l-group").value); });
// ‹ › : salta a la sesión registrada anterior/siguiente. Si no hay más, al miércoles anterior/siguiente.
function shiftWed(n){
  const cur=$("l-date").value||todayISO();
  const dates=[...new Set(Object.keys(data.sessions).map(k=>data.sessions[k].date||k))].sort();
  const reg = n>0 ? dates.find(d=>d>cur) : [...dates].reverse().find(d=>d<cur);
  const d=new Date(cur+"T12:00:00"); const dow=d.getDay();
  let diff = n>0 ? ((3-dow+7)%7||7) : -(((dow-3+7)%7)||7); d.setDate(d.getDate()+diff);
  d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); const sem=d.toISOString().slice(0,10);
  // la más cercana de las dos: el día de taller de al lado o una sesión registrada que caiga antes (p. ej. en otro día)
  setDate(!reg ? sem : n>0 ? (reg<sem?reg:sem) : (reg>sem?reg:sem));
}
$("l-prevw").addEventListener("click",()=>shiftWed(-1)); $("l-nextw").addEventListener("click",()=>shiftWed(1));
$("l-date").addEventListener("change",()=>{ if($("l-date").value) setDate($("l-date").value); });

async function saveSession(){
  const date=$("l-date").value; if(!date){ setStatus("l-status","Falta la fecha.","err"); return; }
  if(isSesLocked(curSessionId)) return;
  const sid=curSessionId||date; const prev=data.sessions[sid];
  const ahora=checked(); const base=baseSes.present;
  const op={action:"sessio", key:"s:"+sid, data:{id:sid, date, group:prev?prev.group||"":"", add:ahora.filter(p=>!base.includes(p)), remove:base.filter(p=>!ahora.includes(p)),
    othersAdd:others().filter(o=>!(baseSes.others||[]).some(x=>x.toLowerCase()===o.toLowerCase())),
    othersRemove:(baseSes.others||[]).filter(x=>!others().some(o=>o.toLowerCase()===x.toLowerCase()))}};
  const kDraft=draftKey();
  setStatus("l-status","");
  // 1) Al instante: guardado en el móvil, pantalla cerrada con sus botones. Se puede seguir usando la web.
  aplicarOp(data,op); curSessionId=sid; baseSes={id:sid, present:data.sessions[sid].present.slice(), others:data.sessions[sid].others.slice()}; abiertos.delete("s:"+sid); clearDraft(kDraft);
  const sigue=()=>curSessionId===sid && !abiertos.has("s:"+sid); // otra fecha en pantalla, o corrigiendo otra vez: no se toca la pantalla
  botonEstado("ok","Asistencia guardada ✓"); renderRoster(); marcar(data.sessions[sid].present, data.sessions[sid].others); applySesLock(); lineaGuardada("subiendo"); updPendientes();
  // 2) Por detrás: se sube a la hoja (en orden, con lo demás pendiente). La barrita de arriba indica que está subiendo.
  try{
    const res=await store.send(op);
    if(res.encola){ if(sigue()) lineaGuardada("cola"); }
    else {
      if(res.session && data.sessions[sid] && !store.pending().some(o=>o.key==="d:"+sid)){ data.sessions[sid]=res.session; const extra=res.session.present.length-ahora.length;
        if(sigue()){ baseSes={id:sid, present:res.session.present.slice(), others:(res.session.others||[]).slice()}; marcar(res.session.present,res.session.others);
          if(extra>0) setStatus("l-status",`Se han sumado ${extra} ${extra===1?"persona marcada":"personas marcadas"} desde otro móvil.`,"ok"); } }
      if(sigue()) lineaGuardada();
    }
  }catch(e){ botonEstado("err","No se ha guardado"); setStatus("l-status","La hoja ha rechazado el cambio: "+e.message,"err"); refresh(); }
  updPendientes();
}

// Borrar una sesión entera (p. ej. una de prueba). Pide confirmación y queda en el Historial.
$("l-borrar").addEventListener("click",()=>{
  const sid=curSessionId; if(!sid||!data.sessions[sid]) return; const d=data.sessions[sid].date||sid;
  confirmar($("l-lockrow"), `¿Estás seguro de eliminar el registro de asistencia del ${DIAS[new Date(d+"T12:00:00").getDay()]} ${fmt(d)}? Desaparece del Resumen y de la hoja.`, "Sí, eliminar", async()=>{
    const op={action:"deleteSession", key:"d:"+sid, data:{id:sid}}; aplicarOp(data,op); abiertos.delete("s:"+sid); clearDraft();
    curSessionId=null; setDate(d); setStatus("l-status","Registro eliminado.","ok");
    try{ const res=await store.send(op); if(res.encola) setStatus("l-status","Registro eliminado. "+textoEspera(),"ok"); }
    catch(e){ setStatus("l-status","La hoja ha rechazado el borrado: "+e.message,"err"); refresh(); }
    updPendientes();
  }, true);
});
