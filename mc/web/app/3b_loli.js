// ===== 3b. LOLI (Casal de la Dona): lo que hay que entregarle, mes a mes =====
// Desde septiembre de 2026: 15 % de las cuotas de cada mes + 20 € por cada alta del Casal cobrada ese mes.
// Se cuenta POR MES DE CUOTA (decisión de Mario, 3/11/2026): los 400 € de Oskia cuentan 40 € cada mes.
// "Entregado" se guarda en Config como loli:AAAA-MM = {data, importe}; el puente lo apunta en el Historial.
const LOLI_DESDE="2026-09", LOLI_PCT=0.15;
const r2 = x => Math.round(x*100)/100;
const eur = x => (Math.round(x*100)/100).toLocaleString("es-ES",{minimumFractionDigits:0,maximumFractionDigits:2})+" €";
function loliDe(mes){
  const rows=(data.pagos[mes]||{rows:{}}).rows||{}; const cuotas=Object.values(rows).reduce((a,r)=>a+(Number(r.amount)||0),0);
  const altas=Object.values(data.persons).filter(p=>p.socia&&p.socia.casal&&String(p.socia.casal.date||"").slice(0,7)===mes);
  const parte=r2(cuotas*LOLI_PCT), altasEur=altas.reduce((a,p)=>a+(Number(p.socia.casal.amount)||0),0);
  const ent=data.settings&&data.settings["loli:"+mes];
  return {mes, cuotas, parte, altas, altasEur, total:r2(parte+altasEur), tuyo:r2(cuotas-parte), entregado: ent||null};
}
function mesesLoli(hasta){ const ms=new Set(Object.keys(data.pagos)); Object.values(data.persons).forEach(p=>{ if(p.socia&&p.socia.casal&&p.socia.casal.date) ms.add(String(p.socia.casal.date).slice(0,7)); });
  return [...ms].filter(m=>m>=LOLI_DESDE && m<=hasta).sort(); }
function renderLoli(){
  const box=$("p-loli"); if(!box) return;
  const hoy=todayISO().slice(0,7);
  if(curMonth<LOLI_DESDE){ box.innerHTML=`<h2>Loli · Casal de la Dona</h2><p class="note">En la T1 eran 30 € fijos al mes.</p>`; return; }
  const v=loliDe(curMonth);
  const pend=mesesLoli(hoy).map(loliDe).filter(x=>!x.entregado && x.total>0);
  const cerrados=pend.filter(x=>x.mes<hoy), enCurso=pend.find(x=>x.mes===hoy);
  const totalPend=r2(cerrados.reduce((a,x)=>a+x.total,0));
  box.innerHTML=`<h2>Loli · Casal de la Dona</h2>
    <div class="loli-mes">
      <div class="lm-row"><span>Cuotas de ${esc(monthName(curMonth))}</span><b>${eur(v.cuotas)}</b></div>
      <div class="lm-row"><span>15 % para Loli</span><b>${eur(v.parte)}</b></div>
      ${v.altas.length?`<div class="lm-row"><span>Altas del Casal (${v.altas.map(p=>esc(p.name)).join(", ")})</span><b>${eur(v.altasEur)}</b></div>`:""}
      <div class="lm-row lm-tot"><span>Para Loli este mes</span><b>${eur(v.total)}</b></div>
      <div class="lm-row lm-tuyo"><span>Tuyo</span><b>${eur(v.tuyo)}</b></div>
      <p class="lm-estado">${v.entregado?`${CANDADO}<b>Entregado</b>${v.entregado.data?" el "+esc(fmt(v.entregado.data)):""}`:(curMonth>=hoy?"Mes en curso: aún se pueden sumar cuotas.":"Pendiente de entregar.")}</p>
    </div>
    <div class="loli-pend ${totalPend?"":"cero"}">
      <div class="lp-tit">Pendiente de entregar a Loli</div>
      <div class="lp-num">${eur(totalPend)}</div>
      <div class="lp-det">${cerrados.length?cerrados.map(x=>`${esc(monthName(x.mes))}: ${eur(x.total)}`).join(" · "):"Nada pendiente de los meses ya acabados."}${enCurso?`<br>${esc(monthName(hoy))} (en curso): ${eur(enCurso.total)} hasta ahora`:""}</div>
      ${totalPend?`<button class="btn small" id="lp-entregar" type="button">Entregado a Loli: ${eur(totalPend)}</button>`:""}
    </div>`;
  const b=$("lp-entregar"); if(b) b.addEventListener("click",()=>{
    confirmar(b, `¿Has entregado ${eur(totalPend)} a Loli? Quedará apuntado ${cerrados.map(x=>monthName(x.mes)).join(" y ")} como entregado, con fecha de hoy.`, "Sí, entregado", async()=>{
      const set={}; cerrados.forEach(x=>{ set["loli:"+x.mes]={data:todayISO(), importe:x.total}; });
      const op={action:"settings", key:"c:loli", data:set}; aplicarOp(data,op); renderLoli(); updPendientes();
      try{ await store.send(op); }catch(e){ setStatus("p-status","La hoja ha rechazado el cambio: "+e.message,"err"); refresh(); }
      renderLoli(); updPendientes();
    });
  });
}
