// ===== 6. HISTORIAL: todo lo que se ha guardado, con fecha y hora =====
// Arriba, lo que está guardado en este móvil y aún no ha llegado a la hoja. Debajo, el registro de la hoja
// (lo guardado desde cualquier móvil). Tocar una línea lleva a esa sesión o a ese mes.
function textoPendiente(op){
  const d=op.data, nom=id=>(data.persons[id]||{name:id}).name;
  if(op.action==="sessio"){ const p=(d.add||[]).map(x=>"+"+nom(x)).concat((d.remove||[]).map(x=>"−"+nom(x))); return `Sesión del ${fmt(d.date||d.id)}: ${p.length?p.join(", "):"sin cambios en la lista"}`; }
  if(op.action==="pagaments"){ const p=Object.keys(d.set||{}).map(x=>`${nom(x)} ${d.set[x].amount} €`).concat((d.unset||[]).map(x=>"−"+nom(x))); return `Pagos de ${monthName(d.month)}: ${p.join(", ")}`; }
  if(op.action==="mes") return `${d.tancat?"Cerrar":"Reabrir"} ${monthName(d.month)}`;
  if(op.action==="persona") return `${nom(d.id)}: ${Object.keys(d.set||{}).join(", ")}`;
  return op.action;
}
function diaHist(t){ const d=new Date(t); if(isNaN(d)) return "";
  const k=x=>`${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; const hoy=new Date(), ayer=new Date(Date.now()-864e5);
  if(k(d)===k(hoy)) return "Hoy"; if(k(d)===k(ayer)) return "Ayer";
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}${d.getFullYear()!==hoy.getFullYear()?" de "+d.getFullYear():""}`; }
function renderHistorial(){
  const box=$("h-list"); box.innerHTML="";
  const pend=store?store.pending():[];
  if(pend.length){
    const h=document.createElement("h3"); h.className="hday warn"; h.textContent=textoEspera(); box.append(h);
    pend.forEach(op=>{ const li=document.createElement("div"); li.className="hitem pend"; li.innerHTML=`<span class="ht">${esc(hora(op.t).split(" a las ")[1]||"")}</span><span class="hx">${esc(textoPendiente(op))}</span>`; box.append(li); });
  }
  const reg=(data.registre||[]).slice();
  $("h-empty").hidden = reg.length>0 || pend.length>0;
  let dia="";
  reg.forEach(r=>{
    const dd=diaHist(r.t); if(dd!==dia){ dia=dd; const h=document.createElement("h3"); h.className="hday"; h.textContent=dd; box.append(h); }
    const d=new Date(r.t); const hh=isNaN(d)?"":`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    const it=document.createElement("button"); it.type="button"; it.className="hitem";
    it.innerHTML=`<span class="ht">${esc(hh)}</span><span class="hx">${esc(r.text)}</span>`;
    it.addEventListener("click",()=>{
      if(r.accio==="sessio" && data.sessions[r.ref]){ show("lista"); setDate(data.sessions[r.ref].date||r.ref.slice(0,10), r.ref); }
      else if((r.accio==="pagaments"||r.accio==="mes") && /^\d{4}-\d{2}$/.test(r.ref)){ curMonth=r.ref; show("pagos"); }
      else if(r.accio==="persona" && data.persons[r.ref]){ show("pers"); const el=document.querySelector(`[data-ficha="${CSS.escape(r.ref)}"]`); if(el){ el.click(); el.scrollIntoView({block:"center"}); } }
    });
    box.append(it);
  });
}
