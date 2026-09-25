/* ==========================================================================
   APPLICATION STARTUP
   Event wiring and service-worker registration. Loaded last so all feature
   modules are already available when DOMContentLoaded fires.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async ()=>{
  bindNavigation();
  bindDialog();
  bindPhysicalLogbook();
  bindScanLogbook();
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
  $("#clearFlightsBtn").addEventListener("click",async()=>{
    if(confirm("Delete all flight data from this device? This cannot be undone.")){
      await clearFlights(); await refresh(); toast("Flight data deleted");
    }
  });
  $("#settingsPhysicalExportBtn").addEventListener("click",physicalExportZip);
  $("#settingsPhysicalImportInput").addEventListener("change",async e=>{
    const file=e.target.files[0];
    if(file) await physicalImportZip(file);
    e.target.value="";
  });
  $("#clearPhysicalBtn").addEventListener("click",async()=>{
    if(confirm("Delete the entire physical log book from this device? This cannot be undone.")){
      await physicalClearAll(); physicalPages=[]; physicalIndex=0; physicalSelectedIds.clear();
      await physicalRender(); toast("Physical log book deleted");
    }
  });
  $("#clearAllDataBtn").addEventListener("click",async()=>{
    if(confirm("Delete ALL flight data and the entire physical log book from this device? This cannot be undone.")){
      await clearFlights(); await physicalClearAll();
      flights=[]; physicalPages=[]; physicalIndex=0; physicalSelectedIds.clear();
      await refresh(); await physicalRender(); toast("All data deleted");
    }
  });
  $("#updateBtn").addEventListener("click",checkForUpdate);
  $("#addClassBtn")?.addEventListener("click",addAircraftClass);
  $("#newClassName")?.addEventListener("keydown",e=>{if(e.key==="Enter")addAircraftClass();});
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-view]");
    if(nav){e.preventDefault();showView(nav.dataset.view);}
    const item=e.target.closest("[data-stats-item]");
    if(item){statsSelectedItem=item.dataset.statsItem;renderStatistics();}
  });
  document.addEventListener("change",e=>{
    if(e.target.id==="statsBreakdown"||e.target.id==="statsRoleFilter"||e.target.id==="statsRouteFilter"||e.target.id==="statsDayNightFilter"){
      statsSelectedItem=null;
      renderStatistics();
    }
  });

  if("serviceWorker" in navigator){
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(refreshing) window.location.reload();
    });
  }
  await loadAppVersion();
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

