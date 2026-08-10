const $=s=>document.querySelector(s);
let flights=[];
let deferredInstall=null;
let refreshing=false;
let aircraftClasses=[];

document.addEventListener("DOMContentLoaded", async ()=>{
  bindNavigation();
  bindDialog();
  setupCompactInputs();
  $("#search").addEventListener("input",renderLogbook);
  $("#yearFilter").addEventListener("change",renderLogbook);
  document.querySelectorAll("[data-stats-range]").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll("[data-stats-range]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    $("#customRange").classList.toggle("hidden",b.dataset.statsRange!=="custom");
    renderStatistics();
  }));
  $("#statsFrom").addEventListener("change",renderStatistics);
  $("#statsTo").addEventListener("change",renderStatistics);
  $("#exportBtn").addEventListener("click",exportData);
  $("#importInput").addEventListener("change",importData);
  $("#clearBtn").addEventListener("click",clearData);
  $("#updateBtn").addEventListener("click",checkForUpdate);
  $("#brandHomeLink")?.addEventListener("click",e=>{
    e.preventDefault();
    showView("home");
    window.scrollTo({top:0,behavior:"smooth"});
  });
  $("#addClassBtn")?.addEventListener("click",addAircraftClass);
  $("#newClassName")?.addEventListener("keydown",e=>{if(e.key==="Enter")addAircraftClass();});
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-view]");
    if(nav){e.preventDefault();showView(nav.dataset.view);}
  });

  if("serviceWorker" in navigator){
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(refreshing) window.location.reload();
    });
  }
  await refresh();
  await loadAircraftClasses();
  const updateMessage=localStorage.getItem("skylogUpdateMessage");
  if(updateMessage){
    localStorage.removeItem("skylogUpdateMessage");
    const status=$("#updateStatus");
    if(status){status.textContent=updateMessage;status.classList.add("success");}
    setTimeout(()=>toast(updateMessage),500);
  }
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").then(reg=>window.skylogRegistration=reg).catch(()=>{});
  }
});

window.showView=function showView(id){
  const target=document.getElementById(id);
  if(!target) return;
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  document.querySelectorAll(".bottom-nav button").forEach(x=>x.classList.toggle("active",x.dataset.nav===id));
  if(id==="statistics") renderStatistics();
  if(id==="logbook") renderLogbook();
}
function bindNavigation(){
  document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.nav)));
  document.querySelectorAll("[data-action='new-flight']").forEach(b=>b.addEventListener("click",()=>openDialog()));
}

function bindDialog(){
  $("#closeDialog").onclick=()=>$("#flightDialog").close();
  $("#cancelDialog").onclick=()=>$("#flightDialog").close();
  $("#deleteFlight").onclick=async()=>{
    const id=$("#flightId").value;
    if(id && confirm("Delete this flight?")){await deleteFlight(id);$("#flightDialog").close();await refresh();toast("Flight deleted");}
  };
  $("#flightForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const id=$("#flightId").value || crypto.randomUUID();
    const storedDate=displayToISODate($("#date").value);
    const depart=normaliseTime($("#departTime").value);
    const arrival=normaliseTime($("#arrivalTime").value);
    if(!storedDate){alert("Please enter a valid date as DD/MM/YYYY.");return;}
    if(!depart||!arrival){alert("Please enter valid times as HH:MM.");return;}
    const flight={
      id,date:storedDate,registration:$("#registration").value.trim().toUpperCase(),
      aircraft:$("#aircraft").value.trim().toUpperCase(),departure:$("#departure").value.trim().toUpperCase(),
      arrival:$("#arrival").value.trim().toUpperCase(),departTime:depart, arrivalTime:arrival,
      blockMinutes:calculateDuration(depart,arrival),
      role:$("#role").value,flightType:$("#flightType").value,nightMinutes:num("nightMinutes"),
      instrumentMinutes:num("instrumentMinutes"),takeoffs:num("takeoffs"),landings:num("landings"),remarks:$("#remarks").value.trim()
    };
    await putFlight(flight);$("#flightDialog").close();await refresh();toast("Flight saved");
  });
}
const num=id=>Math.max(0,Number($("#"+id).value)||0);
function isoToDisplayDate(iso){if(!iso)return "";const [y,m,d]=iso.split("-");return d&&m&&y?`${d}/${m}/${y}`:"";}
function displayToISODate(value){const m=String(value||"").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return "";const [,d,mo,y]=m;const dt=new Date(Number(y),Number(mo)-1,Number(d));if(dt.getFullYear()!==Number(y)||dt.getMonth()!==Number(mo)-1||dt.getDate()!==Number(d))return "";return `${y}-${mo}-${d}`;}
function normaliseTime(value){const m=String(value||"").trim().match(/^(\d{1,2}):(\d{2})$/);if(!m)return "";const h=Number(m[1]),min=Number(m[2]);if(h>23||min>59)return "";return `${String(h).padStart(2,"0")}:${m[2]}`;}
function formatDateInput(el){let v=el.value.replace(/\D/g,"").slice(0,8);if(v.length>4)v=v.slice(0,2)+"/"+v.slice(2,4)+"/"+v.slice(4);else if(v.length>2)v=v.slice(0,2)+"/"+v.slice(2);el.value=v;}
function formatTimeInput(el){let v=el.value.replace(/\D/g,"").slice(0,4);if(v.length>2)v=v.slice(0,2)+":"+v.slice(2);el.value=v;}
function setupCompactInputs(){const d=$("#date"),p=$("#departTime"),a=$("#arrivalTime");d?.addEventListener("input",()=>formatDateInput(d));p?.addEventListener("input",()=>formatTimeInput(p));a?.addEventListener("input",()=>formatTimeInput(a));}


function openDialog(f=null){
  $("#dialogTitle").textContent=f?"Edit flight":"Log flight";
  $("#flightId").value=f?.id||"";
  $("#date").value=f?.date?isoToDisplayDate(f.date):"";
  $("#registration").value=f?.registration||"";
  $("#aircraft").value=f?.aircraft||"";
  $("#departure").value=f?.departure||"";
  $("#arrival").value=f?.arrival||"";
  $("#departTime").value=f?.departTime||"";
  $("#arrivalTime").value=f?.arrivalTime||"";
  $("#role").value=f?.role||"PIC";
  $("#flightType").value=f?.flightType||"VFR";
  $("#nightMinutes").value=f?.nightMinutes??0;
  $("#instrumentMinutes").value=f?.instrumentMinutes??0;
  $("#takeoffs").value=f?.takeoffs??1;
  $("#landings").value=f?.landings??1;
  $("#remarks").value=f?.remarks||"";
  $("#deleteFlight").classList.toggle("hidden",!f);
  $("#flightDialog").showModal();
}

async function refresh(){
  flights=await getAllFlights();
  renderStats();renderRecent();renderLogbook();renderStatistics();populateYears();
}
function calculateDuration(depart, arrival){
  if(!depart || !arrival) return 0;
  const [dh,dm]=depart.split(":").map(Number), [ah,am]=arrival.split(":").map(Number);
  let start=dh*60+dm, end=ah*60+am;
  if(end<start) end+=24*60; // supports flights crossing midnight
  return end-start;
}
function hours(min){return (Math.round((min/60)*10)/10).toFixed(1)}
function entryHours(min){return Math.round((min/60)*10)/10}
function sumRoundedHours(list, field="blockMinutes"){
  return list.reduce((sum,f)=>sum+entryHours(Number(f[field])||0),0);
}
function displayHours(value){return value.toFixed(1)}
function total(field){return flights.reduce((s,f)=>s+(Number(f[field])||0),0)}
function renderStats(){
  const totalRounded=sumRoundedHours(flights), picRounded=sumRoundedHours(flights.filter(f=>f.role==="P.1" || f.role==="P.1/S"));
  const totalMin=total("blockMinutes"), pic=flights.filter(f=>f.role==="P.1" || f.role==="P.1/S").reduce((s,f)=>s+f.blockMinutes,0);
  $("#stats").innerHTML=[
    ["Total time",displayHours(totalRounded)+" h"],["PIC",displayHours(picRounded)+" h"],["Night",displayHours(sumRoundedHours(flights,"nightMinutes"))+" h"],["Take-offs",total("takeoffs")],["Landings",total("landings")]
  ].map(x=>`<div class="stat"><strong>${x[1]}</strong><span>${x[0]}</span></div>`).join("");
}
function flightHTML(f){
  return `<article class="flight" data-id="${f.id}">
    <div class="flight-date">${formatDate(f.date)}</div>
    <div><div class="route">${f.departure} → ${f.arrival}</div><div class="flight-meta">${f.registration} · ${f.aircraft} · ${f.role} · ${f.flightType}${f.remarks?" · "+escapeHTML(f.remarks):""}</div></div>
    <div class="flight-time">${hours(f.blockMinutes)} h<small>${f.departTime||"--:--"}–${f.arrivalTime||"--:--"} GMT</small></div>
  </article>`;
}
function attachFlightClicks(){
  document.querySelectorAll(".flight").forEach(el=>el.onclick=()=>openDialog(flights.find(f=>f.id===el.dataset.id)));
}
function renderRecent(){
  const data=flights.slice(0,6);
  $("#recentFlights").innerHTML=data.length?data.map(flightHTML).join(""):`<div class="empty">No flights yet. Tap “Log flight” to start.</div>`;
  attachFlightClicks();
}
function renderLogbook(){
  const q=($("#search")?.value||"").toLowerCase(), y=$("#yearFilter")?.value||"";
  const data=flights.filter(f=>(!y||f.date.startsWith(y)) && (!q||[f.registration,f.aircraft,f.departure,f.arrival,f.remarks,f.flightType].join(" ").toLowerCase().includes(q)));
  $("#allFlights").innerHTML=data.length?data.map(flightHTML).join(""):`<div class="empty">No matching flights.</div>`;
  attachFlightClicks();
}
function populateYears(){
  const years=[...new Set(flights.map(f=>f.date.slice(0,4)))].sort().reverse();
  const old=$("#yearFilter").value;
  $("#yearFilter").innerHTML='<option value="">All years</option>'+years.map(y=>`<option>${y}</option>`).join("");
  $("#yearFilter").value=years.includes(old)?old:"";
}
function renderStatistics(){
  const active=$("#statistics .filter-btn.active")?.dataset.statsRange || "all";
  let data=flights;
  let rangeLabel="All time";

  if(active==="90"){
    const endDate=new Date();
    endDate.setHours(23,59,59,999);
    const startDate=new Date(endDate);
    startDate.setDate(startDate.getDate()-89);
    const from=startDate.toISOString().slice(0,10);
    const to=endDate.toISOString().slice(0,10);
    data=flights.filter(f=>f.date>=from && f.date<=to);
    rangeLabel=`${formatDate(from)} – ${formatDate(to)}`;
  }else if(active==="custom"){
    const from=$("#statsFrom").value;
    const to=$("#statsTo").value;
    if(from && to){
      data=flights.filter(f=>f.date>=from && f.date<=to);
      rangeLabel=`${formatDate(from)} – ${formatDate(to)}`;
    }else{
      data=[];
      rangeLabel="Choose a start and end date";
    }
  }

  const byAircraft={};
  data.forEach(f=>byAircraft[f.aircraft]=(byAircraft[f.aircraft]||0)+entryHours(f.blockMinutes));
  const entries=Object.entries(byAircraft).sort((a,b)=>b[1]-a[1]);
  const max=entries[0]?.[1]||1;
  const totalTime=sumRoundedHours(data);
  const picTime=sumRoundedHours(data.filter(f=>f.role==="P.1" || f.role==="P.1/S"));
  const nightTime=sumRoundedHours(data,"nightMinutes");
  const instrumentTime=sumRoundedHours(data,"instrumentMinutes");
  const takeoffs=total("takeoffs"); // overwritten below for filtered set
  const filteredTakeoffs=data.reduce((s,f)=>s+(Number(f.takeoffs)||0),0);
  const filteredLandings=data.reduce((s,f)=>s+(Number(f.landings)||0),0);

  $("#statisticsContent").innerHTML=`
    <div class="stats-range-label">${escapeHTML(rangeLabel)} · ${data.length} flight${data.length===1?"":"s"}</div>
    <div class="stats-grid">
      <div class="stat"><strong>${displayHours(totalTime)} h</strong><span>Total time</span></div>
      <div class="stat"><strong>${displayHours(picTime)} h</strong><span>P.1 / P.1/S</span></div>
      <div class="stat"><strong>${displayHours(nightTime)} h</strong><span>Night</span></div>
      <div class="stat"><strong>${filteredTakeoffs}</strong><span>Take-offs</span></div>
      <div class="stat"><strong>${filteredLandings}</strong><span>Landings</span></div>
    </div>
    <div class="panel" style="margin-bottom:14px"><div class="panel-head"><h3>By aircraft</h3></div><div class="bars">
      ${entries.length?entries.map(([k,v])=>`<div class="bar-row"><strong>${escapeHTML(k)}</strong><div class="bar"><i style="width:${Math.max(2,v/max*100)}%"></i></div><span>${displayHours(v)} h</span></div>`).join(""):`<div class="empty">No flights in this period.</div>`}
    </div></div>
    <div class="panel"><table class="stat-table">
      <tr><td>Flights</td><td>${data.length}</td></tr>
      <tr><td>Total time</td><td>${displayHours(totalTime)} h</td></tr>
      <tr><td>P.1 / P.1/S time</td><td>${displayHours(picTime)} h</td></tr>
      <tr><td>Night time</td><td>${displayHours(nightTime)} h</td></tr>
      <tr><td>Instrument time</td><td>${displayHours(instrumentTime)} h</td></tr>
      <tr><td>Take-offs</td><td>${filteredTakeoffs}</td></tr>
      <tr><td>Landings</td><td>${filteredLandings}</td></tr>
    </table></div>`;
}
function formatDate(s){return new Date(s+"T12:00:00").toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"})}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1800)}

async function exportData(){
  const blob=new Blob([JSON.stringify({app:"SkyLog",version:1,exportedAt:new Date().toISOString(),flights},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`skylog-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);
}
async function importData(e){
  const file=e.target.files[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text()), list=Array.isArray(data)?data:data.flights;
    if(!Array.isArray(list)) throw Error();
    for(const f of list){ if(f.id) await putFlight(f); }
    await refresh();toast(`${list.length} flights imported`);
  }catch{alert("That file is not a valid SkyLog backup.")}
  e.target.value="";
}
async function clearData(){
  if(confirm("Delete every flight from this device? This cannot be undone.")){await clearFlights();await refresh();toast("Logbook cleared")}
}



function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
async function loadAircraftClasses(){
  try{
    aircraftClasses=await getAircraftClasses();
  }catch(err){
    console.error("Could not load aircraft classes",err);
    aircraftClasses=[];
  }
  aircraftClasses.sort((a,b)=>a.name.localeCompare(b.name));
  renderAircraftClasses();
}
function renderAircraftClasses(){
  const el=$("#aircraftClassesList");
  if(!el) return;
  if(!aircraftClasses.length){
    el.innerHTML="";
    return;
  }
  el.innerHTML=aircraftClasses.map(c=>`
    <div class="aircraft-class" data-class-id="${escapeHtml(c.id)}">
      <div class="class-header">
        <input class="class-name-input" value="${escapeHtml(c.name)}" maxlength="40" aria-label="Class name">
        <div class="class-actions">
          <button type="button" class="secondary save-class">Save</button>
          <button type="button" class="danger delete-class">Delete</button>
        </div>
      </div>
      <div class="class-types">
        <div class="types-heading">Aircraft types</div>
        <div class="type-list">
          ${(c.types||[]).map((t,i)=>`<div class="type-chip"><span>${escapeHtml(t)}</span><button type="button" class="remove-type" data-index="${i}" aria-label="Remove ${escapeHtml(t)}">×</button></div>`).join("") || '<span class="muted">No types added yet.</span>'}
        </div>
        <div class="add-type-row">
          <input class="new-type-input" type="text" maxlength="30" placeholder="e.g. C172">
          <button type="button" class="secondary add-type">Add type</button>
        </div>
      </div>
    </div>`).join("");

  el.querySelectorAll(".save-class").forEach(btn=>btn.addEventListener("click",async e=>{
    const card=e.target.closest(".aircraft-class"), c=aircraftClasses.find(x=>x.id===card.dataset.classId);
    const name=card.querySelector(".class-name-input").value.trim();
    if(!name){toast("Class name cannot be blank.");return;}
    if(aircraftClasses.some(x=>x.id!==c.id && x.name.toLowerCase()===name.toLowerCase())){toast("That class already exists.");return;}
    c.name=name;
    await saveAircraftClass(c);
    await loadAircraftClasses();
    toast("Aircraft class saved.");
  }));
  el.querySelectorAll(".delete-class").forEach(btn=>btn.addEventListener("click",async e=>{
    const card=e.target.closest(".aircraft-class"), c=aircraftClasses.find(x=>x.id===card.dataset.classId);
    if(!confirm(`Delete aircraft class "${c.name}" and its aircraft types?`))return;
    await deleteAircraftClass(c.id);
    await loadAircraftClasses();
  }));
  el.querySelectorAll(".add-type").forEach(btn=>btn.addEventListener("click",async e=>{
    const card=e.target.closest(".aircraft-class"), c=aircraftClasses.find(x=>x.id===card.dataset.classId);
    const input=card.querySelector(".new-type-input"), type=input.value.trim().toUpperCase();
    if(!type){return;}
    c.types=c.types||[];
    if(c.types.some(x=>x.toLowerCase()===type.toLowerCase())){toast("That aircraft type is already in this class.");return;}
    c.types.push(type);
    await saveAircraftClass(c);
    await loadAircraftClasses();
  }));
  el.querySelectorAll(".new-type-input").forEach(input=>input.addEventListener("keydown",e=>{
    if(e.key==="Enter") input.closest(".aircraft-class").querySelector(".add-type").click();
  }));
  el.querySelectorAll(".remove-type").forEach(btn=>btn.addEventListener("click",async e=>{
    const card=e.target.closest(".aircraft-class"), c=aircraftClasses.find(x=>x.id===card.dataset.classId);
    c.types.splice(Number(e.target.dataset.index),1);
    await saveAircraftClass(c);
    await loadAircraftClasses();
  }));
}
async function addAircraftClass(){
  const input=$("#newClassName"), name=input.value.trim();
  if(!name){toast("Enter a class name.");return;}
  if(aircraftClasses.some(x=>x.name.toLowerCase()===name.toLowerCase())){toast("That class already exists.");return;}
  await saveAircraftClass({id:crypto.randomUUID(),name,types:[]});
  input.value="";
  await loadAircraftClasses();
}

async function checkForUpdate(){
  const btn=$("#updateBtn"), status=$("#updateStatus");
  if(!("serviceWorker" in navigator)){
    status.textContent="Updates are not supported by this browser.";
    return;
  }

  btn.disabled=true;
  status.classList.remove("success");
  status.textContent="Checking for updates…";

  try{
    const reg=window.skylogRegistration || await navigator.serviceWorker.getRegistration();
    if(!reg) throw new Error("No service worker registration found.");
    window.skylogRegistration=reg;

    // If an update is already waiting, activate it immediately.
    if(reg.waiting){
      await activateSkyLogUpdate(reg,status);
      return;
    }

    // Ask Safari/iPadOS to check the live HTTPS service-worker script.
    await reg.update();

    // iPadOS can finish the update asynchronously after update() resolves.
    const installing=reg.installing;
    if(installing){
      status.textContent="Downloading update…";
      await new Promise((resolve,reject)=>{
        const onState=()=>{
          if(installing.state==="installed"){
            installing.removeEventListener("statechange",onState);
            resolve();
          }else if(installing.state==="redundant"){
            installing.removeEventListener("statechange",onState);
            reject(new Error("Update became redundant."));
          }
        };
        installing.addEventListener("statechange",onState);
      });
    }

    // The new worker may now be waiting, or it may already have activated.
    if(reg.waiting){
      await activateSkyLogUpdate(reg,status);
      return;
    }

    // If the registration has already taken control, reload and confirm.
    if(navigator.serviceWorker.controller && reg.active){
      status.textContent="You're already using the latest version.";
    }else{
      status.textContent="You're already using the latest version.";
    }
    btn.disabled=false;
  }catch(err){
    console.error(err);
    status.textContent="Could not check for an update. Please try again.";
    btn.disabled=false;
  }
}

function activateSkyLogUpdate(reg,status){
  return new Promise((resolve,reject)=>{
    refreshing=true;
    localStorage.setItem("skylogUpdateMessage","SkyLog was successfully updated to the latest version.");
    status.textContent="Update found. Installing…";

    const timeout=setTimeout(()=>{
      cleanup();
      reject(new Error("Timed out waiting for updated service worker."));
    },10000);

    const onController=()=>{
      cleanup();
      status.textContent="Updated. Reloading…";
      // Give iPadOS a moment to finish switching the standalone document
      // before reloading it.
      setTimeout(()=>window.location.reload(),250);
      resolve();
    };

    const cleanup=()=>{
      clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("controllerchange",onController);
    };

    navigator.serviceWorker.addEventListener("controllerchange",onController);
    reg.waiting.postMessage({type:"SKIP_WAITING"});
  });
}

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("#installBtn").classList.remove("hidden")});
$("#installBtn")?.addEventListener("click",async()=>{if(!deferredInstall)return;deferredInstall.prompt();deferredInstall=null});
