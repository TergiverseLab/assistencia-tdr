// ===== 6. HISTORIAL: todo lo que se ha guardado, con fecha y hora =====
// Arriba, lo que está guardado en este móvil y aún no ha llegado a la hoja. Debajo, el registro de la hoja
// (lo guardado desde cualquier móvil). Tocar una línea lleva a esa sesión o a ese mes.
function textoPendiente(op){
  const d=op.data, nom=id=>(data.persons[id]||{name:id}).name;
  if(op.action==="sessio"){ const det=[]; if((d.add||[]).length) det.push("Marcadas como presentes: "+d.add.map(nom).join(", ")); if((d.remove||[]).length) det.push("Quitadas de la lista: "+d.remove.map(nom).join(", "));
    if((d.othersAdd||[]).length) det.push("Vienen a probar: "+d.othersAdd.join(", ")); return {titulo:`Asistencia · ${diaDe(fmt(d.date||d.id))}`, det:det.length?det:["Sin cambios en la lista"]}; }
  if(op.action==="pagaments"){ const det=[]; const ks=Object.keys(d.set||{}); if(ks.length) det.push("Cuota pagada: "+ks.map(x=>`${nom(x)} (${d.set[x].amount} €)`).join(", ")); if((d.unset||[]).length) det.push("Pago quitado: "+d.unset.map(nom).join(", "));
    return {titulo:`Cuotas · ${monthName(d.month)}`, det:det.length?det:["Sin cambios"]}; }
  if(op.action==="deleteSession") return {titulo:"Asistencia", det:["Borrar el registro de asistencia del "+fmt(String(d.id).slice(0,10))]};
  if(op.action==="mes") return {titulo:`Cuotas · ${monthName(d.month)}`, det:[d.tancat?"Cerrar el mes":"Reabrir el mes"]};
  if(op.action==="persona"){ const st=d.set||{}, det=[]; if(st.active===false) det.push("Dar de baja"); if(st.active===true) det.push("Alta / vuelve a estar activa"); if(st.name) det.push("Nombre: "+st.name); if(st.socia) det.push("Alta del Casal (cambio)"); return {titulo:`Personas · ${nom(d.id)}`, det:det.length?det:["Cambios en la ficha"]}; }
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
    const h=document.createElement("h3"); h.className="hday warn"; h.textContent = store.motivo && !store.enviando() ? textoEspera() : "Subiendo a la hoja…"; box.append(h);
    pend.forEach(op=>{ const li=document.createElement("div"); li.className="hitem pend"; const e=textoPendiente(op); const e2=typeof e==="string"?{titulo:"",det:[e]}:e;
      li.innerHTML=`<span class="ht">${esc(hora(op.t).split(" a las ")[1]||"")}</span><span class="hx">${e2.titulo?`<b>${esc(e2.titulo)}</b>`:""}${e2.det.map(x=>`<span class="hd">${esc(x)}</span>`).join("")}</span>`; box.append(li); });
  }
  const reg=(data.registre||[]).slice();
  $("h-empty").hidden = reg.length>0 || pend.length>0;
  let dia="";
  reg.forEach(r=>{
    const dd=diaHist(r.t); if(dd!==dia){ dia=dd; const h=document.createElement("h3"); h.className="hday"; h.textContent=dd; box.append(h); }
    const d=new Date(r.t); const hh=isNaN(d)?"":`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    const it=document.createElement("button"); it.type="button"; it.className="hitem";
    const e=explicarRegistro(r);
    it.innerHTML=`<span class="ht">${esc(hh)}</span><span class="hx">${e.titulo?`<b>${esc(e.titulo)}</b>`:""}${e.det.map(d=>`<span class="hd">${esc(d)}</span>`).join("")}</span>`;
    it.addEventListener("click",()=>{
      if(r.accio==="sessio" && data.sessions[r.ref]){ show("lista"); setDate(data.sessions[r.ref].date||r.ref.slice(0,10), r.ref); }
      else if((r.accio==="pagaments"||r.accio==="mes"||r.accio==="loli") && /^\d{4}-\d{2}$/.test(r.ref)){ curMonth=r.ref; show("pagos"); }
      else if(r.accio==="persona" && data.persons[r.ref]){ show("pers"); const el=document.querySelector(`[data-ficha="${CSS.escape(r.ref)}"]`); if(el){ el.click(); el.scrollIntoView({block:"center"}); } }
    });
    box.append(it);
  });
}
