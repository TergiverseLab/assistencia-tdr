// ===== 4b. FICHA de cada persona (se despliega al tocar su nombre; se pliega al volver a tocarlo) =====
// Arriba: estado, socia y baja. En medio: datos personales (DNI, nacimiento, teléfono, email, dirección).
// Abajo: su historial (temporadas, sesiones, cuotas).
// Los datos personales NO van con el resto: el puente solo los da con la contraseña de las fichas (la eligen Mario y
// Emi: la primera que se escribe se queda). Se pide CADA VEZ que se abren los datos de una persona; ni la contraseña
// ni los datos se guardan en el móvil.
const CAMPOS_FICHA=[["dni","DNI","text"],["naixement","Fecha de nacimiento","date"],["telefon","Teléfono","tel"],["email","Email","email"],["adreca","Dirección","text"]];
let fitxes=null, fitxesError="", fitxesAviso="";   // null = sin cargar
let clauMem="";                                     // solo en memoria
const clauFichas=()=>clauMem;
async function pidePuente(action,d){
  const r=await fetch(SHEET_URL,{method:"POST",body:JSON.stringify({action,data:Object.assign({clau:clauFichas()},d)})});
  const j=await r.json(); if(!j.ok) throw new Error(j.error||"error"); return j;
}
const textoError=e=>/incorrecta/.test(e.message)?"Contraseña incorrecta.":/corta/.test(e.message)?"La contraseña tiene que tener al menos 4 caracteres.":/desconocida/.test(e.message)?"Falta pegar el puente nuevo en la hoja.":/fetch|network|Failed/i.test(e.message)?"Sin conexión. Vuelve a probar.":"La hoja ha dado un error: "+e.message;
async function cargarFitxes(){
  if(!SHEET_URL || !clauFichas()) return;
  try{ const j=await pidePuente("fitxes",{}); fitxes=j.fitxes||{}; fitxesError=""; fitxesAviso=j.nova?"Contraseña creada. Es la que usaréis Emi y tú a partir de ahora.":""; }
  catch(e){ fitxes=null; fitxesError=textoError(e); if(/incorrecta|corta/.test(e.message)) clauMem=""; }
}
function toggleFicha(pid,row){
  clauMem=""; fitxes=null; fitxesError=""; fitxesAviso="";  // plegar o cambiar de ficha también la olvida
  const next=row.nextElementSibling; if(next&&next.classList.contains("ficha")){ next.remove(); return; }
  document.querySelectorAll("#n-list .ficha").forEach(f=>f.remove());
  const f=document.createElement("div"); f.className="ficha"; f.dataset.pid=pid; row.after(f); pintarFicha(f);
}
function pintarFicha(f){
  const pid=f.dataset.pid, p=data.persons[pid]; if(!p){ f.remove(); return; }
  const season=curSeasonKey(), off=p.active===false, soc=p.socia&&p.socia[season];
  const ses=Object.keys(data.sessions).filter(k=>data.sessions[k].present.includes(pid)).sort((a,b)=>(data.sessions[a].date||a).localeCompare(data.sessions[b].date||b));
  const conLista=ses.filter(sesConLista);
  const temps=new Set(ses.map(sesSeason)); Object.keys(data.pagos).forEach(m=>{ if((data.pagos[m].rows||{})[pid]) temps.add(seasonOf(m)); });
  const pagos=Object.keys(data.pagos).sort().filter(m=>(data.pagos[m].rows||{})[pid]).map(m=>({m,a:Number(data.pagos[m].rows[pid].amount)||0}));
  const fx=(fitxes&&fitxes[pid])||{};
  let personal; const abierto=f.dataset.datos==="1";
  // Plegado: solo el botón "Datos personales". Al abrirlo pide la contraseña (una vez mientras la web esté abierta).
  if(!abierto) personal=`<button class="btn ghost small f-abrir" type="button" aria-expanded="false">Datos personales ▸</button>`;
  else if(!SHEET_URL) personal=`<p class="note">Los datos personales solo se pueden guardar con la hoja conectada.</p>`;
  else if(!clauFichas()) personal=`${fitxesError?`<p class="status err">${esc(fitxesError)}</p>`:""}<div class="row nowrap"><input type="password" class="f-clau" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Contraseña de las fichas" placeholder="Contraseña" style="flex:1"><button class="btn small f-clauok" type="button">Entrar</button></div>`;
  else if(fitxes===null && !fitxesError) personal=`<p class="note">Cargando…</p>`;
  else if(fitxes===null) personal=`<p class="note">${esc(fitxesError)}</p><button class="btn ghost small f-reint" type="button">Volver a probar</button>`;
  else personal=`<div class="campos">
      <label>Nombre<input type="text" data-k="name" value="${esc(p.name)}"></label>
      ${CAMPOS_FICHA.map(([k,l,t])=>`<label>${esc(l)}<input type="${t}" data-k="${k}" value="${esc(fx[k]||"")}" ${t==="tel"?'inputmode="tel"':""} autocomplete="off"></label>`).join("")}
    </div>
    ${fitxesAviso?`<p class="status ok">${esc(fitxesAviso)}</p>`:""}
    <div class="row"><button class="btn small f-save" type="button">Guardar y cerrar</button><button class="btn ghost small f-cerrar" type="button">Cerrar</button><span class="saved f-saved ${fx.savedAt?"ok":""}">${fx.savedAt?"Guardada el "+esc(hora(fx.savedAt)):""}</span></div>`;
  f.innerHTML=`
    <div class="row f-estado"><span class="f-est">${off?"De baja"+(p.to?" desde "+esc(monthName(p.to)):""):"Activa"+(textoDesde(pid)?" · "+esc(textoDesde(pid)):"")}</span>
      ${off?"":`<button class="btn ghost small f-soc ${soc?"on":""}" type="button" aria-pressed="${!!soc}" title="Socia de la Associació Laboratori Línia de Fuga (cuota anual)">${soc?"Socia de la asociación ✓":"Socia de la asociación"}</button>`}
      <button class="btn ghost small f-baja" type="button">${off?"Reactivar":"Dar de baja"}</button></div>
    ${abierto?`<h4>Datos personales</h4>`:""}
    ${personal}
    <span class="status f-status" aria-live="polite"></span>
    <h4>Historial</h4>
    <dl>
      <dt>Temporadas</dt><dd>${[...temps].sort().map(seasonLabel).map(esc).join("<br>")||"—"}</dd>
      <dt>Sesiones con lista</dt><dd>${conLista.length}${conLista.length?` <small>(última: ${esc(fmt(data.sessions[conLista[conLista.length-1]].date||conLista[conLista.length-1]))})</small>`:""}</dd>
      <dt>Cuotas</dt><dd>${pagos.length?`${pagos.length} ${pagos.length===1?"mes":"meses"} · ${pagos.reduce((a,x)=>a+x.a,0)} €<br><small>${pagos.map(x=>esc(shortMonth(x.m))+" "+x.a+" €").join(" · ")}</small>`:"—"}</dd>
      <dt>Socia de la asociación</dt><dd>${Object.keys(p.socia||{}).sort().map(k=>`${esc((SEASONS.find(x=>x.id===k)||{}).years||k)} (${Number(p.socia[k].amount)||0} €${p.socia[k].date?", "+esc(fmt(p.socia[k].date)):""})`).join(", ")||"No"}</dd>
    </dl>`;
  const st=f.querySelector(".f-status"); const q=c=>f.querySelector(c);
  const tras=async()=>{ renderPersons(); renderRoster(); }; // renderPersons ya deja la ficha abierta
  if(q(".f-baja")) q(".f-baja").addEventListener("click",async e=>{ const hacer=async()=>{ e.target.disabled=true; await guardarPersona(pid, off?{active:true,to:""}:{active:false,to:todayISO().slice(0,7)}, st); tras(); };
    if(off) hacer(); else confirmar(q(".f-estado"), `¿Estás seguro de dar de baja a ${p.name}? Deja de salir en la lista (conserva su historial).`, "Sí, dar de baja", hacer, true); });
  if(q(".f-soc")) q(".f-soc").addEventListener("click",async e=>{ e.target.disabled=true; const socia={...(p.socia||{})}; if(socia[season]) delete socia[season]; else socia[season]={amount:SOCIA_AMOUNT,date:todayISO()}; await guardarPersona(pid,{socia},st); tras(); });
  // al cerrar los datos se olvida la contraseña: cada vez que se abren se vuelve a pedir
  const cerrarDatos=(msg)=>{ f.dataset.datos=""; clauMem=""; fitxes=null; fitxesError=""; fitxesAviso=""; pintarFicha(f); if(msg){ const s2=f.querySelector(".f-status"); s2.textContent=msg; s2.className="status f-status ok"; } };
  if(q(".f-abrir")) q(".f-abrir").addEventListener("click",async()=>{ f.dataset.datos="1"; pintarFicha(f); if(fitxes===null && clauFichas()){ await cargarFitxes(); if(f.isConnected) pintarFicha(f); } });
  if(q(".f-cerrar")) q(".f-cerrar").addEventListener("click",()=>cerrarDatos(""));
  const entrar=async()=>{ const c=q(".f-clau").value.trim(); if(!c) return; clauMem=c; fitxes=null; fitxesError=""; pintarFicha(f); await cargarFitxes(); if(f.isConnected) pintarFicha(f); };
  if(q(".f-clauok")){ q(".f-clauok").addEventListener("click",entrar); q(".f-clau").addEventListener("keydown",e=>{ if(e.key==="Enter") entrar(); }); }
  if(q(".f-reint")) q(".f-reint").addEventListener("click",async()=>{ fitxesError=""; pintarFicha(f); await cargarFitxes(); if(f.isConnected) pintarFicha(f); });
  if(q(".f-save")) q(".f-save").addEventListener("click",async e=>{
    const b=e.target; const set={}; f.querySelectorAll("[data-k]").forEach(i=>{ if(i.dataset.k!=="name" && i.value.trim()!==(fx[i.dataset.k]||"")) set[i.dataset.k]=i.value.trim(); });
    const name=q('[data-k="name"]').value.trim();
    if(!Object.keys(set).length && (!name||name===p.name)){ cerrarDatos("Sin cambios."); return; }
    b.disabled=true; b.textContent="Guardando…"; st.textContent="";
    try{
      if(name && name!==p.name) await guardarPersona(pid,{name},st);
      if(Object.keys(set).length){ const j=await pidePuente("fitxa",{id:pid,set}); fitxes=fitxes||{}; fitxes[pid]=j.fitxa; }
      cerrarDatos("Datos guardados ✓");
      if(name && name!==p.name){ renderRoster(); const n=document.querySelector(`[data-ficha="${CSS.escape(pid)}"]`); if(n) n.firstChild.textContent=name; }
    }catch(err){ b.disabled=false; b.textContent="Guardar y cerrar"; st.textContent="No se ha guardado. "+textoError(err); st.className="status f-status err"; }
  });
}
