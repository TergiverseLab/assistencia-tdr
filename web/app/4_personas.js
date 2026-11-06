// Socia: al quitarla se guarda en memoria lo que había; si se vuelve a marcar (p. ej. un toque sin querer), recupera importe y fecha
const sociaQuitada={};
function sociaTras(p,season){ const socia={...(p.socia||{})}, k=p.id+"|"+season;
  if(socia[season]){ sociaQuitada[k]=socia[season]; delete socia[season]; } else socia[season]=sociaQuitada[k]||{amount:SOCIA_AMOUNT,date:todayISO()};
  return socia; }
// ===== 4. PERSONAS =====
// Cada cambio (baja, socia, nombre, alta) se manda como cambio de esos campos solamente.
function personSeasons(){
  const m={}; const add=(pid,s,g)=>{ m[pid]=m[pid]||{seasons:new Set(),groups:new Set()}; m[pid].seasons.add(s); if(g) m[pid].groups.add(g); };
  Object.keys(data.sessions).forEach(k=>{ const s=data.sessions[k]; const se=seasonOf((s.date||k).slice(0,7)); s.present.forEach(pid=>add(pid,se,sesGroup(k))); });
  Object.keys(data.pagos).forEach(mo=>{ const se=seasonOf(mo); Object.keys(data.pagos[mo].rows||{}).forEach(pid=>add(pid,se,null)); });
  Object.values(data.persons).forEach(p=>{ if(p.active!==false) add(p.id,curSeasonKey(),null); });
  return m;
}
async function guardarPersona(id,set,msgEl){
  const op={action:"persona", key:"p:"+id, data:{id,set}}; aplicarOp(data,op);
  try{ const res=await store.send(op); if(res.person) data.persons[id]=res.person; }
  catch(e){ if(msgEl){ msgEl.textContent="La hoja ha rechazado el cambio: "+e.message; msgEl.className="status err"; } refresh(); }
  updPendientes();
}
// La ficha que se despliega al tocar un nombre está en 4b_fichas.js
function renderPersons(){
  // si hay una ficha abierta, se vuelve a abrir igual después de repintar (antes, al llegar los datos de la hoja, se cerraba sola)
  const abierta=document.querySelector("#n-list .ficha"); const seguir=abierta?{pid:abierta.dataset.pid, datos:abierta.dataset.datos||""}:null;
  renderCtx(); const list=$("n-list"); list.innerHTML=""; const season=curSeasonKey(); const ps=personSeasons();
  const cur = ctx.season===curSeasonKey();
  const all=Object.values(data.persons).filter(p=>{
    if(ctx.season==="all") return true;
    if(cur && ctx.group==="all") return p.active!==false || (ps[p.id]&&ps[p.id].seasons.has(ctx.season)) || (!!p.to && seasonOf(p.to)===ctx.season);
    const v=ps[p.id]; if(!v||!v.seasons.has(ctx.season)) return false;
    return ctx.group==="all" || v.groups.has(ctx.group);
  }).sort((a,b)=>(a.active===false)-(b.active===false)||a.name.localeCompare(b.name,"es"));
  $("n-count").textContent=`${all.length} personas`;
  const act=all.filter(p=>p.active!==false); const ns=act.filter(p=>isSocia(p,season)).length; $("n-socias").textContent = ns ? `${ns} de ${act.length} socias ${season}` : "";
  all.forEach(p=>{
    const off=p.active===false; const soc=p.socia&&p.socia[season]; const div=document.createElement("div"); div.className="person";
    const hist=ps[p.id]?[...ps[p.id].seasons].sort().join(", "):"";
    div.innerHTML=`<button class="name linklike ${off?"off":""}" type="button" data-ficha="${esc(p.id)}" aria-label="Ficha de ${esc(p.name)}">${esc(p.name)}<small>${off?("baja"+(p.to?" desde "+esc(monthName(p.to)):"")+(hist?" · "+esc(hist):"")):(soc?`socia de la asociación · ${Number(soc.amount)||0} €`:(esc(textoDesde(p.id))||"activa"))}</small></button>
      ${off?"<span></span>":`<button class="btn ghost small ${soc?"on":""}" type="button" data-soc="${esc(p.id)}" aria-pressed="${!!soc}" aria-label="Socia: ${esc(p.name)}">Socia</button>`}
      <button class="btn ghost small" type="button" data-id="${esc(p.id)}" aria-label="${off?"Reactivar":"Baja"}: ${esc(p.name)}">${off?"Reactivar":"Baja"}</button>`;
    list.append(div);
  });
  list.querySelectorAll("[data-ficha]").forEach(el=>el.addEventListener("click",()=>toggleFicha(el.dataset.ficha, el.closest(".person"))));
  if(seguir){ const fila=list.querySelector(`[data-ficha="${CSS.escape(seguir.pid)}"]`);
    if(fila){ const f=document.createElement("div"); f.className="ficha"; f.dataset.pid=seguir.pid; f.dataset.datos=seguir.datos; fila.closest(".person").after(f); pintarFicha(f); } }
  list.querySelectorAll("button[data-id]").forEach(b=>b.addEventListener("click",async()=>{
    const p=data.persons[b.dataset.id]; const set = p.active===false ? {active:true, to:""} : {active:false, to:todayISO().slice(0,7)};
    const hacer=async()=>{ b.disabled=true; await guardarPersona(p.id,set); renderPersons(); renderRoster(); };
    if(p.active===false) hacer(); else confirmar(b.closest(".person"), `¿Estás seguro de dar de baja a ${p.name}? Deja de salir en la lista (conserva su historial).`, "Sí, dar de baja", hacer, true);
  }));
  list.querySelectorAll("button[data-soc]").forEach(b=>b.addEventListener("click",()=>{
    const p=data.persons[b.dataset.soc]; const quitar=!!(p.socia&&p.socia[season]);
    const hacer=async()=>{ b.disabled=true; await guardarPersona(p.id,{socia:sociaTras(p,season)}); renderPersons(); };
    if(quitar) confirmar(b.closest(".person"), `¿Quitar a ${p.name} como socia (${seasonLabel(season)})? Se borra el pago de la cuota de socia.`, "Sí, quitar", hacer, true); else hacer();
  }));
}
$("n-add").addEventListener("click",async()=>{
  const name=$("n-name").value.trim(); if(!name) return; const id=slug(name);
  if(!id){ setStatus("n-status","Escribe un nombre válido.","err"); return; }
  const ya=data.persons[id];
  if(ya && ya.active!==false){ setStatus("n-status",`${ya.name} ya está en la lista.`,"err"); return; }
  $("n-add").disabled=true;
  if(ya){ await guardarPersona(id,{active:true,to:""}); setStatus("n-status",`${ya.name} vuelve a estar activa.`,"ok"); }
  else { await guardarPersona(id,{name,active:true,from:todayISO().slice(0,7),to:""}); setStatus("n-status",`Alta de ${name}.`,"ok"); }
  $("n-add").disabled=false; $("n-name").value=""; renderPersons(); renderRoster();
});
