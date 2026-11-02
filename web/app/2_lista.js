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
  const box=$("l-roster"); box.innerHTML=""; const q=quotaInfo();
  rosterFor(curSessionId,$("l-date").value).forEach(p=>{
    const l=document.createElement("label"); l.className="p";
    const c=document.createElement("input"); c.type="checkbox"; c.value=p.id;
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
function updCount(){ $("l-count").textContent=checked().length+others().length; }
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
$("l-all").addEventListener("click",()=>{ $("l-roster").querySelectorAll("input").forEach(c=>{c.checked=true;c.parentElement.classList.add("on");}); updCount(); saveDraft(); });
$("l-clear").addEventListener("click",()=>{ $("l-roster").querySelectorAll("input").forEach(c=>{c.checked=false;c.parentElement.classList.remove("on");}); $("l-others").value=""; updCount(); saveDraft(); setStatus("l-status",""); });

function setDate(iso, sid){
  $("l-date").value=iso; const d=new Date(iso+"T12:00:00");
  $("l-dayname").innerHTML=`<span>${esc(DIAS[d.getDay()]||"")} ${esc(fmt(iso))}</span><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;
  const found=sessionsOn(iso); const grouped=found.filter(k=>data.sessions[k].group);
  curSessionId = (sid && data.sessions[sid]) ? sid : (found.length ? found[0] : null);
  $("l-grouprow").hidden=grouped.length===0;
  if(grouped.length){ $("l-group").innerHTML=grouped.map(k=>`<option value="${esc(k)}">grup ${esc(sesGroup(k))}</option>`).join(""); $("l-group").value=curSessionId; }
  renderRoster(); loadSession(curSessionId); applySesLock(); if(!isSesLocked(curSessionId)) applyDraft();
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
  if(s&&s.savedAt){ el.textContent=`Guardada el ${hora(s.savedAt)}`; el.className="saved ok"; }
  else if(s){ el.textContent=""; el.className="saved"; }
  else { el.textContent="Sesión nueva: todavía no se ha guardado."; el.className="saved"; }
}
function applySesLock(){
  const sid=curSessionId; const has=!!(sid&&data.sessions[sid]); const locked=isSesLocked(sid);
  const past = has && (data.sessions[sid].date||sid) < todayISO();
  $("l-lockrow").hidden=!past; $("l-lock").textContent = locked ? "Desbloquear para corregir" : "Volver a cerrar";
  $("l-info").textContent = past ? (locked ? "Sesión pasada: cerrada para no tocarla sin querer." : "Abierta para corregir: al guardar se cierra sola.") : "";
  $("l-roster").querySelectorAll("input").forEach(c=>c.disabled=locked); $("l-others").disabled=locked; $("l-all").disabled=locked; $("l-clear").disabled=locked;
  $("l-borrar").hidden = !has || locked;   // borrar: solo una sesión guardada y abierta (las pasadas, tras desbloquear)
  if(vistaActual==="lista") botonGuardar();
}
$("l-lock").addEventListener("click",()=>{
  if(!curSessionId) return; const k="s:"+curSessionId;
  if(isSesLocked(curSessionId)) confirmar($("l-lockrow"), "Esta sesión ya está cerrada. ¿Seguro que quieres modificarla?", "Sí, modificar", ()=>{
    abiertos.add(k); applySesLock(); setStatus("l-status","Sesión desbloqueada: corrige y guarda.","ok"); });
  else { const cerrar=()=>{ abiertos.delete(k); loadSession(curSessionId); clearDraft(); applySesLock(); setStatus("l-status","Sesión cerrada sin cambios.","ok"); };
    if(listaTocada()) confirmar($("l-lockrow"), "Hay cambios sin guardar. ¿Cerrar y descartarlos?", "Sí, descartar", cerrar); else cerrar(); }
});
$("l-group").addEventListener("change",()=>{ setDate($("l-date").value, $("l-group").value); });
// ‹ › : salta a la sesión registrada anterior/siguiente. Si no hay más, al miércoles anterior/siguiente.
function shiftWed(n){
  const cur=$("l-date").value||todayISO();
  const dates=[...new Set(Object.keys(data.sessions).map(k=>data.sessions[k].date||k))].sort();
  const target = n>0 ? dates.find(d=>d>cur) : [...dates].reverse().find(d=>d<cur);
  if(target){ setDate(target); return; }
  const d=new Date(cur+"T12:00:00"); const dow=d.getDay();
  let diff = n>0 ? ((3-dow+7)%7||7) : -(((dow-3+7)%7)||7); d.setDate(d.getDate()+diff);
  d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); setDate(d.toISOString().slice(0,10));
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
  botonEstado("busy"); lineaGuardada("busy"); setStatus("l-status","");
  aplicarOp(data,op); curSessionId=sid; baseSes={id:sid, present:data.sessions[sid].present.slice(), others:data.sessions[sid].others.slice()}; abiertos.delete("s:"+sid); clearDraft(kDraft);
  const sigue=()=>curSessionId===sid; // si mientras se guarda se cambia de fecha, no se toca la pantalla nueva
  try{
    const res=await store.send(op);
    if(res.encola){ botonEstado("ok",textoEsperaCorto()); lineaGuardada("cola"); }
    else {
      if(res.session){ const antes=ahora.length; data.sessions[sid]=res.session; const extra=res.session.present.length-antes;
        if(sigue()){ baseSes={id:sid, present:res.session.present.slice(), others:(res.session.others||[]).slice()}; marcar(res.session.present,res.session.others); }
        if(extra>0 && sigue()) setStatus("l-status",`Se han sumado ${extra} ${extra===1?"persona marcada":"personas marcadas"} desde otro móvil.`,"ok"); }
      botonEstado("ok","Asistencia guardada ✓"); if(sigue()) lineaGuardada();
    }
  }catch(e){ botonEstado("err","No se ha guardado"); setStatus("l-status","La hoja ha rechazado el cambio: "+e.message,"err"); refresh(); }
  if(sigue()){ renderRoster(); const s=data.sessions[sid]; if(s){ baseSes={id:sid, present:s.present.slice(), others:(s.others||[]).slice()}; marcar(s.present,s.others); } lineaGuardada(store.pending().some(o=>o.key==="s:"+sid)?"cola":undefined);
    applySesLock(); }
  updPendientes();
}

// Borrar una sesión entera (p. ej. una de prueba). Pide confirmación y queda en el Historial.
$("l-borrar").addEventListener("click",()=>{
  const sid=curSessionId; if(!sid||!data.sessions[sid]) return; const d=data.sessions[sid].date||sid;
  confirmar($("l-acciones"), `¿Estás seguro de borrar el registro de asistencia del ${DIAS[new Date(d+"T12:00:00").getDay()]} ${fmt(d)}? Desaparece del Resumen y de la hoja.`, "Sí, borrar", async()=>{
    const op={action:"deleteSession", key:"d:"+sid, data:{id:sid}}; aplicarOp(data,op); abiertos.delete("s:"+sid); clearDraft();
    curSessionId=null; setDate(d); setStatus("l-status","Registro de asistencia borrado.","ok");
    try{ const res=await store.send(op); if(res.encola) setStatus("l-status","Registro de asistencia borrado. "+textoEspera(),"ok"); }
    catch(e){ setStatus("l-status","La hoja ha rechazado el borrado: "+e.message,"err"); refresh(); }
    updPendientes();
  });
});
