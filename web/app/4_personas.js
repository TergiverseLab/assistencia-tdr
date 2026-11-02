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
// Ficha de persona: historial completo y corrección del nombre
function toggleFicha(pid,row){
  const next=row.nextElementSibling; if(next&&next.classList.contains("ficha")){ next.remove(); return; }
  document.querySelectorAll("#n-list .ficha").forEach(f=>f.remove());
  const p=data.persons[pid]; if(!p) return;
  const ses=Object.keys(data.sessions).filter(k=>data.sessions[k].present.includes(pid)).sort((a,b)=>(data.sessions[a].date||a).localeCompare(data.sessions[b].date||b));
  const conLista=ses.filter(sesConLista);
  const temps=[...new Set(ses.map(sesSeason))]; Object.keys(data.pagos).forEach(m=>{ if((data.pagos[m].rows||{})[pid]) temps.push(seasonOf(m)); });
  const pagos=Object.keys(data.pagos).sort().filter(m=>(data.pagos[m].rows||{})[pid]).map(m=>({m,a:Number(data.pagos[m].rows[pid].amount)||0}));
  const socia=Object.keys(p.socia||{}).sort();
  const f=document.createElement("div"); f.className="ficha";
  f.innerHTML=`<dl>
    <dt>Alta</dt><dd>${p.from?esc(monthName(p.from)):"—"}</dd>
    <dt>Estado</dt><dd>${p.active===false?"baja"+(p.to?" desde "+esc(monthName(p.to)):""):"activa"}</dd>
    <dt>Temporadas</dt><dd>${[...new Set(temps)].sort().map(seasonLabel).map(esc).join("<br>")||"—"}</dd>
    <dt>Sesiones con lista</dt><dd>${conLista.length}${conLista.length?` <small>(última: ${esc(fmt(data.sessions[conLista[conLista.length-1]].date||conLista[conLista.length-1]))})</small>`:""}</dd>
    <dt>Cuotas</dt><dd>${pagos.length?`${pagos.length} meses · ${pagos.reduce((a,x)=>a+x.a,0)} €<br><small>${pagos.map(x=>esc(shortMonth(x.m))+" "+x.a+" €").join(" · ")}</small>`:"—"}</dd>
    <dt>Socia</dt><dd>${socia.length?socia.map(k=>`${esc(k)} (${Number(p.socia[k].amount)||0} €)`).join(", "):"—"}</dd>
  </dl>
  <div class="row nowrap"><input type="text" value="${esc(p.name)}" aria-label="Nombre de ${esc(p.name)}" style="flex:1"><button class="btn small" type="button">Guardar nombre</button></div>
  <span class="status" aria-live="polite"></span>`;
  const inp=f.querySelector("input"), btn=f.querySelector("button"), st=f.querySelector(".status");
  btn.addEventListener("click",async()=>{ const name=inp.value.trim(); if(!name||name===p.name) return; btn.disabled=true; await guardarPersona(pid,{name},st); renderPersons(); renderRoster(); });
  row.after(f);
}
function renderPersons(){
  renderCtx(); const list=$("n-list"); list.innerHTML=""; const season=curSeasonKey(); const ps=personSeasons();
  const cur = ctx.season===curSeasonKey();
  const all=Object.values(data.persons).filter(p=>{
    if(ctx.season==="all") return true;
    if(cur && ctx.group==="all") return p.active!==false || (ps[p.id]&&ps[p.id].seasons.has(ctx.season));
    const v=ps[p.id]; if(!v||!v.seasons.has(ctx.season)) return false;
    return ctx.group==="all" || v.groups.has(ctx.group);
  }).sort((a,b)=>(a.active===false)-(b.active===false)||a.name.localeCompare(b.name,"es"));
  $("n-count").textContent=`${all.length} personas`;
  const act=all.filter(p=>p.active!==false); const ns=act.filter(p=>isSocia(p,season)).length; $("n-socias").textContent = ns ? `${ns} de ${act.length} socias ${season}` : "";
  all.forEach(p=>{
    const off=p.active===false; const soc=p.socia&&p.socia[season]; const div=document.createElement("div"); div.className="person";
    const hist=ps[p.id]?[...ps[p.id].seasons].sort().join(", "):"";
    div.innerHTML=`<button class="name linklike ${off?"off":""}" type="button" data-ficha="${esc(p.id)}" aria-label="Ficha de ${esc(p.name)}">${esc(p.name)}<small>${off?("baja"+(p.to?" desde "+esc(monthName(p.to)):"")+(hist?" · "+esc(hist):"")):(soc?`sòcia ${esc(season)} · ${Number(soc.amount)||0} € · ${esc(fmt(soc.date))}`:(p.from?"alta en "+esc(monthName(p.from)):"activa"))}</small></button>
      ${off?"<span></span>":`<button class="btn ghost small ${soc?"on":""}" type="button" data-soc="${esc(p.id)}" aria-pressed="${!!soc}" aria-label="Socia: ${esc(p.name)}">Socia</button>`}
      <button class="btn ghost small" type="button" data-id="${esc(p.id)}" aria-label="${off?"Reactivar":"Baja"}: ${esc(p.name)}">${off?"Reactivar":"Baja"}</button>`;
    list.append(div);
  });
  list.querySelectorAll("[data-ficha]").forEach(el=>el.addEventListener("click",()=>toggleFicha(el.dataset.ficha, el.closest(".person"))));
  list.querySelectorAll("button[data-id]").forEach(b=>b.addEventListener("click",async()=>{
    const p=data.persons[b.dataset.id]; const set = p.active===false ? {active:true, to:""} : {active:false, to:todayISO().slice(0,7)};
    b.disabled=true; await guardarPersona(p.id,set); renderPersons(); renderRoster();
  }));
  list.querySelectorAll("button[data-soc]").forEach(b=>b.addEventListener("click",async()=>{
    const p=data.persons[b.dataset.soc]; const socia={...(p.socia||{})};
    if(socia[season]) delete socia[season]; else socia[season]={amount:SOCIA_AMOUNT,date:todayISO()};
    b.disabled=true; await guardarPersona(p.id,{socia}); renderPersons();
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
