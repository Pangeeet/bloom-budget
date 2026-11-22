// Optional cloud sync. Local-only mode remains available until config is provided.
const config=window.BLOOM_FIREBASE_CONFIG;
const ui=()=>document.getElementById('shared-ui');
let db,auth,user,householdId=null,stopListening=null,remoteReady=false,lastRemote='',pending=null,saving=false,cloudError='';
let api=null;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function refresh(){const target=ui();if(!target)return;
 if(!config){target.innerHTML='<p class="sm">Offline mode · Cloud connection not configured yet.</p><p class="sm">Use the setup guide to connect two phones securely.</p>';return;}
 if(!api){target.innerHTML='<p class="sm">Connecting cloud services…</p>';return;}
 if(!user){target.innerHTML=`<p class="sm">Your private shared household budget</p><button class="btn" id="cloud-google">Continue with Google</button><p class="sm">Use Safari to sign in first. Home Screen sign-in may need additional iPhone testing.</p>${cloudError?`<p class="warning">${escape(cloudError)}</p>`:''}`;return;}
 const verified=user.emailVerified;
 target.innerHTML=`<div class="sm">Signed in: ${escape(user.email)} ${verified?'✓ Verified':'· Verify your email'}</div>${verified?householdId?`<p class="sm">☁️ Shared household connected</p><label>Household ID (share privately with Ronnie)</label><input readonly id="cloud-house-id" value="${escape(householdId)}"><div class="row"><button class="ghost" id="cloud-copy">Copy ID</button><button class="ghost" id="cloud-disconnect">Leave this device</button></div><label>Invite partner by exact email address</label><input id="cloud-invite-email" type="email" placeholder="Partner email"><button class="ghost" id="cloud-invite">Allow partner</button><p class="sm">Changes sync while online. Avoid simultaneous edits to the same item.</p>`:`<p class="sm">Start a new shared household, or enter the ID your partner sent.</p><button class="btn" id="cloud-create">Create household</button><label>Household ID to join</label><input id="cloud-join-id" placeholder="Paste household ID"><button class="ghost" id="cloud-join">Join household</button>`:`<p class="sm">Verify your email from the message sent to you, then refresh verification.</p><button class="ghost" id="cloud-send-verification">Send verification email</button><button class="ghost" id="cloud-reload-user">I've verified</button>`}<div class="row"><button class="ghost" id="cloud-signout">Sign out</button></div>${cloudError?`<p class="warning">${escape(cloudError)}</p>`:''}`;
}
function error(e){cloudError=(e?.message||String(e)).slice(0,250);refresh()}
function noHousehold(){if(stopListening)stopListening();stopListening=null;householdId=null;remoteReady=false;lastRemote='';clearTimeout(pending);refresh()}
function subscribe(id){if(stopListening)stopListening();householdId=id;remoteReady=false;lastRemote='';clearTimeout(pending);
 const docRef=api.doc(db,'households',id);
 stopListening=api.onSnapshot(docRef,snap=>{if(!snap.exists()){error(new Error('Household not found'));noHousehold();return}const d=snap.data();if(d.budget){const json=JSON.stringify(d.budget);if(json!==lastRemote){lastRemote=json;window.BloomBridge.applyRemote(d.budget)}}remoteReady=true;refresh()},error);
 localStorage.setItem('bloom-household',id);refresh();}
function queueSave(data){if(!householdId||!remoteReady||!user?.emailVerified||!api)return;let next=JSON.stringify(data);if(next===lastRemote)return;
 clearTimeout(pending);pending=setTimeout(async()=>{if(saving){queueSave(window.BloomBridge.getState());return}saving=true;try{const payload=window.BloomBridge.getState();const str=JSON.stringify(payload);if(str===lastRemote)return;await api.updateDoc(api.doc(db,'households',householdId),{budget:payload,updatedAt:api.serverTimestamp()});lastRemote=str;cloudError=''}catch(e){error(e)}finally{saving=false}},900);
}
window.BloomCloud={refresh,queueSave};
if(config?.apiKey&&config?.projectId){
 try{
  const [a,f,store]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')]);
  api={...f,...store};const app=a.initializeApp(config);auth=f.getAuth(app);db=store.getFirestore(app);
  f.onAuthStateChanged(auth,u=>{user=u;cloudError='';if(!u){noHousehold()}else if(u.emailVerified){let old=localStorage.getItem('bloom-household');if(old)subscribe(old)}refresh()});refresh();
 }catch(e){error(e)}
}else refresh();
document.addEventListener('click',async e=>{const id=e.target?.id;if(!id?.startsWith('cloud-')||!api)return;
 const val=id2=>document.getElementById(id2)?.value?.trim()||'';
 try{
 if(id==='cloud-google'){await api.signInWithPopup(auth,new api.GoogleAuthProvider())}
 else if(id==='cloud-reload-user'){await auth.currentUser.reload();user=auth.currentUser;refresh()}
 else if(id==='cloud-signout'){noHousehold();localStorage.removeItem('bloom-household');await api.signOut(auth)}
 else if(id==='cloud-disconnect'){noHousehold();localStorage.removeItem('bloom-household')}
 else if(id==='cloud-create'){let ref=api.doc(api.collection(db,'households'));let email=user.email.toLowerCase();await api.setDoc(ref,{ownerUid:user.uid,allowedEmails:[email],budget:window.BloomBridge.getState(),createdAt:api.serverTimestamp(),updatedAt:api.serverTimestamp()});subscribe(ref.id)}
 else if(id==='cloud-join'){let target=val('cloud-join-id');if(!/^[A-Za-z0-9]{12,40}$/.test(target))throw new Error('Invalid household ID');await api.getDoc(api.doc(db,'households',target));subscribe(target)}
 else if(id==='cloud-invite'){let email=val('cloud-invite-email').toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw new Error('Enter a valid email address');await api.updateDoc(api.doc(db,'households',householdId),{allowedEmails:api.arrayUnion(email)})}
 else if(id==='cloud-copy')await navigator.clipboard.writeText(householdId);
 cloudError='';refresh();
 }catch(e){error(e)}
});
