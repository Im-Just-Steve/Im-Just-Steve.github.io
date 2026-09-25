/* ==========================================================================
   UPDATE / INSTALL SUPPORT
   ========================================================================== */

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
