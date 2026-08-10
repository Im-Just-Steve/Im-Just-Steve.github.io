const DB_NAME = "skylog-db";
const STORE = "flights";
let dbPromise;

function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = () => {
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE)){
        const store=db.createObjectStore(STORE,{keyPath:"id"});
        store.createIndex("date","date");
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}
async function getAllFlights(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly"), req=tx.objectStore(STORE).getAll();
    req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.date.localeCompare(a.date)));
    req.onerror=()=>reject(req.error);
  });
}
async function putFlight(flight){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,"readwrite").objectStore(STORE).put(flight);
    req.onsuccess=()=>resolve(flight); req.onerror=()=>reject(req.error);
  });
}
async function deleteFlight(id){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,"readwrite").objectStore(STORE).delete(id);
    req.onsuccess=()=>resolve(); req.onerror=()=>reject(req.error);
  });
}
async function clearFlights(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,"readwrite").objectStore(STORE).clear();
    req.onsuccess=()=>resolve(); req.onerror=()=>reject(req.error);
  });
}
async function getAircraftClasses(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("aircraftClasses","readonly");
    const req=tx.objectStore("aircraftClasses").getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
async function saveAircraftClass(item){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("aircraftClasses","readwrite");
    tx.objectStore("aircraftClasses").put(item);
    tx.oncomplete=()=>resolve(item);
    tx.onerror=()=>reject(tx.error);
  });
}
async function deleteAircraftClass(id){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("aircraftClasses","readwrite");
    tx.objectStore("aircraftClasses").delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
