// ===== 3. PAGOS =====
// Igual que en Lista: se guarda SOLO lo que ha cambiado respecto a lo que se cargó (quién se marca, quién se
// desmarca, qué importe cambia), nunca el mes entero. Lo marcado sin guardar queda en un borrador del móvil.
let curMonth = todayISO().slice(0,7);
let basePag = {month:null, rows:{}};
// En pagos salen las activas y quien tenga pago ese mes aunque esté de baja. Un mes pasado cerrado: solo quien pagó.
function payPersons(month){
  const rows=(data.pagos[month]||{rows:{}}).rows||{}; const thisM=todayISO().slice(0,7);
  const ids = (month<thisM && isLocked(month)) ? new Set(Object.keys(rows)) : new Set(activePersons().map(p=>p.id).concat(Object.keys(rows)));
  return [...ids].map(id=>data.persons[id]||{id,name:id,active:false}).sort((a,b)=>a.name.localeCompare(b.name,"es"));
}
function shiftMonth(n){ const [y,m]=curMonth.split("-").map(Number); const d=new Date(y,m-1+n,1); curMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; renderPagos(); }
$("p-pick").addEventListener("change",()=>{ if(/^\d{4}-\d{2}$/.test($("p-pick").value)){ curMonth=$("p-pick").value; renderPagos(); } });
$("p-default").addEventListener("input",()=>{ $("p-list").querySelectorAll(".tog[data-id]:not(.on)").forEach(b=>{ $("p-list").querySelector(`input[data-id="${CSS.escape(b.dataset.id)}"]`).value=defAmount(); }); updTotal(); });
// Cuotas como Asistencia: al guardar, el mes queda registrado (candado). "Corregir cuotas" lo abre (con confirmación);
// al guardar se vuelve a cerrar. "Cancelar corrección" lo deja como estaba.
$("p-lock").addEventListener("click",()=>{
  const m=curMonth, k="m:"+m;
  if(abiertos.has(k)){ // corrigiendo → cancelar
    const cancelar=()=>{ abiertos.delete(k); clearPagDraft(); renderPagos(); setStatus("p-status","Corrección cancelada: las cuotas quedan como estaban.","ok"); };
    if(pagosTocados()) confirmar($("p-lockrow"), "Hay cambios sin guardar. ¿Cancelar y descartarlos?", "Sí, descartar", cancelar); else cancelar(); return; }
  confirmar($("p-lockrow"), `¿Seguro que quieres corregir las cuotas de ${monthName(m)}?`, "Sí, corregir", ()=>{ abiertos.add(k); renderPagos(); setStatus("p-status",""); });
});
async function marcarMes(m,tancat){
  const op={action:"mes", key:"c:"+m, data:{month:m, tancat}}; aplicarOp(data,op); abiertos.delete("m:"+m); renderPagos();
  try{ const res=await store.send(op); setStatus("p-status", res.encola ? textoEspera() : (tancat?`${monthName(m)} cerrado.`:`${monthName(m)} abierto.`),"ok"); }
  catch(e){ setStatus("p-status","La hoja ha rechazado el cambio: "+e.message,"err"); refresh(); }
  updPendientes();
}
$("p-prev").addEventListener("click",()=>shiftMonth(-1)); $("p-next").addEventListener("click",()=>shiftMonth(1));

// ---- borrador de pagos por mes ----
const pagDraftKey = m => "tdr-pdraft-"+(m||curMonth);
function estadoPantalla(){ const ui={}, soc={};
  $("p-list").querySelectorAll(".tog[data-id]").forEach(b=>{ ui[b.dataset.id]={on:b.classList.contains("on"), amount:Number($("p-list").querySelector(`input[data-id="${CSS.escape(b.dataset.id)}"]`).value)||0}; });
  $("p-list").querySelectorAll(".tog[data-socid]").forEach(b=>{ if(b.classList.contains("on")) soc[b.dataset.socid]=Number($("p-list").querySelector(`input[data-socid="${CSS.escape(b.dataset.socid)}"]`).value)||SOCIA_AMOUNT; });
  return {ui,soc}; }
function cambiosPagos(){ // compara la pantalla con la base cargada
  const {ui,soc}=estadoPantalla(); const set={}, unset=[];
  Object.keys(ui).forEach(pid=>{ const b=basePag.rows[pid]; const u=ui[pid];
    if(u.on && (!b || Number(b.amount)!==u.amount)) set[pid]={amount:u.amount, date:(b&&b.date)||todayISO()};
    if(!u.on && b) unset.push(pid); });
  return {set, unset, soc};
}
function pagosTocados(){ const c=cambiosPagos(); return Object.keys(c.set).length+c.unset.length+Object.keys(c.soc).length>0; }
function savePagDraft(){ try{ if(pagosTocados()) localStorage.setItem(pagDraftKey(),JSON.stringify({...estadoPantalla(), base:basePag.rows, t:Date.now()})); else localStorage.removeItem(pagDraftKey()); }catch(e){} }
function clearPagDraft(m){ try{ localStorage.removeItem(pagDraftKey(m)); }catch(e){} }
function readPagDraft(){ try{ return JSON.parse(localStorage.getItem(pagDraftKey())||"null"); }catch(e){ return null; } }
const hayBorradorPagos = () => !!readPagDraft();

function renderPagos(){
  $("p-month").textContent=monthName(curMonth); $("p-pick").value=curMonth;
  const rows=(data.pagos[curMonth]||{rows:{}}).rows||{}; const thisM=todayISO().slice(0,7); const past=curMonth<thisM; const locked=isLocked(curMonth);
  basePag={month:curMonth, rows:JSON.parse(JSON.stringify(rows))};
  const list=$("p-list"); list.innerHTML="";
  const abiertoTemp=abiertos.has("m:"+curMonth);
  $("p-lockrow").hidden = !mesRegistrado(curMonth);
  $("p-lock").textContent = abiertoTemp ? "Cancelar corrección" : "Corregir cuotas";
  $("p-lockmsg").textContent = abiertoTemp ? "Cambia lo que haga falta y pulsa Guardar." : "";
  $("p-default").disabled = locked; $("p-defaultwrap").hidden = past || locked;
  const personas=payPersons(curMonth);
  if(!personas.length){ list.innerHTML='<p class="empty">No consta ningún pago en este mes.</p>'; }
  personas.forEach(p=>{
    const r=rows[p.id]; const div=document.createElement("div"); div.className="pay"+(mesRegistrado(curMonth) && !r ? " falta" : "");   // mes registrado: quien no ha pagado, en rojo
    div.innerHTML=`<div class="name">${esc(p.name)}<small>${p.active===false?"(baja) ":""}${r&&r.date?"pagado "+esc(fmt(r.date)):"pendiente"}</small></div>
      <input type="number" inputmode="decimal" min="0" step="1" value="${esc(r?r.amount:defAmount())}" class="${r?"":"dim"}" aria-label="Importe ${esc(p.name)}" data-id="${esc(p.id)}" ${locked?"disabled":""}>
      <button class="tog ${r?"on":""}" type="button" data-id="${esc(p.id)}" aria-pressed="${!!r}" aria-label="Pagado ${esc(p.name)}" ${locked?"disabled":""}>${r?"✓":"○"}</button>`;
    list.append(div);
    if(asocOn() && p.active!==false && !isSocia(p,curSeasonKey()) && curMonth>=thisM){
      const sd=document.createElement("div"); sd.className="pay soc";
      sd.innerHTML=`<div class="name">↳ cuota de socia ${esc(curSeasonKey())}<small>pendiente</small></div><input type="number" inputmode="decimal" min="0" step="1" value="${SOCIA_AMOUNT}" class="dim" aria-label="Cuota socia ${esc(p.name)}" data-socid="${esc(p.id)}"><button class="tog" type="button" data-socid="${esc(p.id)}" aria-pressed="false" aria-label="Cuota socia pagada ${esc(p.name)}">○</button>`;
      list.append(sd);
    }
  });
  const togg=(b,on)=>{ b.classList.toggle("on",on); b.textContent=on?"✓":"○"; b.setAttribute("aria-pressed",String(on)); };
  list.querySelectorAll(".tog[data-socid]").forEach(b=>b.addEventListener("click",()=>{ const on=!b.classList.contains("on"); togg(b,on); list.querySelector(`input[data-socid="${CSS.escape(b.dataset.socid)}"]`).classList.toggle("dim",!on); updTotal(); savePagDraft(); }));
  list.querySelectorAll(".tog[data-id]").forEach(b=>b.addEventListener("click",()=>{
    const inp=list.querySelector(`input[data-id="${CSS.escape(b.dataset.id)}"]`); const on=!b.classList.contains("on");
    togg(b,on); inp.classList.toggle("dim",!on); if(on && !inp.value) inp.value=defAmount(); updTotal(); savePagDraft(); }));
  list.querySelectorAll("input").forEach(i=>i.addEventListener("input",()=>{ updTotal(); savePagDraft(); }));
  // borrador: lo marcado sin guardar vuelve a aparecer
  const d=!locked && readPagDraft(); setStatus("p-status","");
  if(d){ basePag={month:curMonth, rows:d.base||{}};
    Object.keys(d.ui||{}).forEach(pid=>{ const b=list.querySelector(`.tog[data-id="${CSS.escape(pid)}"]`), i=list.querySelector(`input[data-id="${CSS.escape(pid)}"]`); if(!b) return; togg(b,d.ui[pid].on); i.value=d.ui[pid].amount; i.classList.toggle("dim",!d.ui[pid].on); });
    Object.keys(d.soc||{}).forEach(pid=>{ const b=list.querySelector(`.tog[data-socid="${CSS.escape(pid)}"]`); if(b){ togg(b,true); const i=list.querySelector(`input[data-socid="${CSS.escape(pid)}"]`); i.value=d.soc[pid]; i.classList.remove("dim"); } });
    if(pagosTocados()) setStatus("p-status","Recuperado lo que tenías marcado sin guardar. Pulsa Guardar cuando termines.","ok"); else clearPagDraft(); }
  updTotal(); lineaPagos(); if(vistaActual==="pagos") botonGuardar();
}
function lineaPagos(estado){
  const el=$("p-saved"); const rows=(data.pagos[curMonth]||{rows:{}}).rows||{};
  if(estado==="busy"){ el.textContent="Guardando…"; el.className="saved"; return; }
  if(estado==="subiendo"){ el.textContent="Guardadas · subiendo a la hoja…"; el.className="saved ok"; return; }
  if(store && store.pending().some(o=>o.key==="m:"+curMonth)){
    if(store.motivo && !store.enviando()){ el.textContent=textoEspera(); el.className="saved warn"; }   // falló de verdad
    else { el.textContent="Guardadas · subiendo a la hoja…"; el.className="saved ok"; }                 // subiendo
    return; }
  const ult=Object.values(rows).map(r=>r.savedAt||"").sort().pop();
  if(abiertos.has("m:"+curMonth)){ el.innerHTML=`${CANDADO_ABIERTO}<b>Corrigiendo</b>`; el.className="saved reg"; return; }
  if(mesRegistrado(curMonth)){ el.innerHTML=`${CANDADO}<b>Registradas</b>${ult?" · "+esc(hora(ult)):""}`; el.className="saved reg"; return; }
  el.textContent=""; el.className="saved";
}
function updTotal(){ const {ui,soc}=estadoPantalla(); const on=Object.values(ui).filter(u=>u.on); let t=on.reduce((a,u)=>a+u.amount,0); const ns=Object.keys(soc).length; t+=Object.values(soc).reduce((a,v)=>a+v,0);
  $("p-total").textContent=`${on.length} pagos${ns?` + ${ns} socia`:""} · ${t} €`; }

async function savePagos(){
  const month=curMonth; if(isLocked(month)) return; const c=cambiosPagos();
  if(!Object.keys(c.set).length && !c.unset.length && !Object.keys(c.soc).length){ setStatus("p-status","No hay cambios que guardar.","ok"); return; }
  setStatus("p-status","");
  const ops=[];
  if(Object.keys(c.set).length||c.unset.length) ops.push({action:"pagaments", key:"m:"+month, data:{month, set:c.set, unset:c.unset, nous:Object.keys(c.set).filter(pid=>!basePag.rows[pid])}});
  Object.keys(c.soc).forEach(pid=>{ const p=data.persons[pid]; if(!p) return; ops.push({action:"persona", key:"p:"+pid, data:{id:pid, set:{socia:{...(p.socia||{}),[curSeasonKey()]:{amount:c.soc[pid],date:todayISO()}}}}}); });
  // 1) Al instante: guardado en el móvil y en pantalla. 2) Por detrás: se sube a la hoja (barrita de arriba).
  ops.forEach(op=>aplicarOp(data,op)); abiertos.delete("m:"+month); clearPagDraft(month);
  botonEstado("ok","Cuotas guardadas ✓"); renderPagos(); lineaPagos("subiendo"); updPendientes();
  let error=null;
  await Promise.all(ops.map(op=>store.send(op).then(res=>{ if(res.encola) return; if(res.pagos) data.pagos[month]={month, rows:res.pagos.rows}; if(res.person) data.persons[res.person.id]=res.person; }).catch(e=>{ error=e; })));
  if(error){ botonEstado("err","No se ha guardado"); setStatus("p-status","La hoja ha rechazado algún cambio: "+error.message,"err"); refresh(); }
  if(vistaActual==="pagos" && curMonth===month && !pagosTocados()) renderPagos(); else if(curMonth===month) lineaPagos();
  updPendientes();
}
