import './style.css';
import { collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage, auth, app as firebaseApp, firebaseConfigured, ensureAnonymousSession } from './firebase.js';

const app = document.querySelector('#app');
const functions = getFunctions(firebaseApp);
const approveSubmission = httpsCallable(functions, 'approveSubmission');
const rejectSubmission = httpsCallable(functions, 'rejectSubmission');
let activeFilter = 'all';
let selectedFile = null;
let adminUser = null;
const escapeHtml = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories = ['All','Confessions','Photography','Memes','Videos','Random'];

app.innerHTML = `
<header class="topbar"><a class="brand" href="#"><span class="brand-mark">a.</span><span>anonyma</span></a><nav><a href="#explore">Explore</a><a href="#submit">Submit</a><a class="nav-admin" href="#admin">Admin</a></nav></header>
<main>
<section class="hero"><div class="eyebrow"><span class="pulse"></span> A SPACE WITHOUT NAMES</div><h1>Say it. Share it.<br><em>Leave your name out.</em></h1><p>A home for the things people want to share, without attaching an identity. Your voice, your moment, your choice.</p><div class="hero-actions"><a class="button primary" href="#submit">Share anonymously <span>↗</span></a><a class="button quiet" href="#explore">Explore the feed</a></div><div class="hero-note"><span>◉</span> No public profiles. No follower counts. Just content.</div></section>
<section class="submit-section" id="submit"><div class="section-head"><div><div class="eyebrow">YOUR SPACE</div><h2>Put it out there.</h2></div><span class="section-index">01 / SUBMIT</span></div>
<form id="submission-form" class="submit-card"><label class="field-label" for="caption">A caption or confession <span>OPTIONAL</span></label><textarea id="caption" maxlength="1200" placeholder="Get it off your chest..."></textarea><div class="form-row"><label class="select-wrap"><span class="field-label">CATEGORY</span><select id="category"><option>Confessions</option><option>Photography</option><option>Memes</option><option>Videos</option><option>Random</option></select></label><label class="upload-box" for="media"><span class="upload-icon">＋</span><span><strong id="file-label">Attach image or video</strong><small>Up to 100 MB</small></span><input id="media" type="file" accept="image/*,video/*" /></label></div><div class="form-bottom"><span class="privacy-note">◈ Your submission is reviewed before it goes public.</span><button class="button primary" type="submit" id="submit-button">Send anonymously <span>↗</span></button></div><p class="form-message" id="form-message" role="status"></p></form></section>
<section class="feed-section" id="explore"><div class="section-head"><div><div class="eyebrow">THE COMMUNITY</div><h2>Out in the open.</h2></div><span class="section-index">02 / EXPLORE</span></div><div class="filters" id="filters"></div><div class="feed-grid" id="feed"><div class="empty-state">The gallery is quiet for now.<br><span>Approved submissions will appear here.</span></div></div></section>
<section class="admin-section" id="admin"><div class="section-head"><div><div class="eyebrow">CONTROL ROOM</div><h2>Moderation.</h2></div><span class="section-index">03 / ADMIN</span></div>
<div class="admin-card" id="admin-root"><form id="admin-login" class="admin-login"><label class="field-label" for="admin-email">ADMIN EMAIL</label><input id="admin-email" type="email" autocomplete="username" required placeholder="admin@example.com"><label class="field-label" for="admin-password">PASSWORD</label><input id="admin-password" type="password" autocomplete="current-password" required placeholder="Your password"><button class="button primary" type="submit" id="admin-login-button">Sign in <span>↗</span></button><p class="form-message" id="admin-message" role="status">Administrator access only.</p></form><div id="admin-dashboard" hidden><div class="admin-toolbar"><p id="admin-status">Signed in as administrator.</p><button class="button quiet" id="admin-logout" type="button">Sign out</button></div><div id="pending-list" class="pending-list"><div class="empty-state">Loading pending submissions...</div></div></div></div>
</section>
</main><footer><a class="brand" href="#"><span class="brand-mark">a.</span><span>anonyma</span></a><span>Without a name. With a voice.</span><span>© ${new Date().getFullYear()} ANONYMA</span></footer>`;

const filters = document.querySelector('#filters');
filters.innerHTML = categories.map((c,i)=>`<button class="filter ${i===0?'active':''}" data-filter="${c.toLowerCase()}">${c}</button>`).join('');
filters.addEventListener('click', e => { const b=e.target.closest('[data-filter]'); if(!b)return; activeFilter=b.dataset.filter; filters.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b)); loadFeed(); });
document.querySelector('#media').addEventListener('change', e=>{selectedFile=e.target.files[0]||null;document.querySelector('#file-label').textContent=selectedFile?.name||'Attach image or video';});

document.querySelector('#submission-form').addEventListener('submit', async e=>{
 e.preventDefault(); const button=document.querySelector('#submit-button'), msg=document.querySelector('#form-message');
 if(!firebaseConfigured){msg.textContent='Firebase setup is not connected yet.';msg.className='form-message error';return;}
 const caption=document.querySelector('#caption').value.trim();
 if(!selectedFile&&!caption){msg.textContent='Write something or attach an image/video before sending.';msg.className='form-message error';return;}
 if(selectedFile.size>100*1024*1024){msg.textContent='That file is over the 100 MB limit.';msg.className='form-message error';return;}
 if(!selectedFile.type.startsWith('image/')&&!selectedFile.type.startsWith('video/')){msg.textContent='Only image and video files are accepted.';msg.className='form-message error';return;}
 button.disabled=true;button.textContent='Sending...';msg.textContent='';
 let stage='authentication';
 try{
  const user=await ensureAnonymousSession();
  let mediaPath=null;
  if(selectedFile){
   stage='storage upload';
   const safeName=selectedFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');
   mediaPath=`submissions/${user.uid}/${Date.now()}-${safeName}`;
   await uploadBytes(ref(storage,mediaPath),selectedFile,{contentType:selectedFile.type});
  }
  stage='Firestore record creation';
  const submission={ownerUid:user.uid,caption,category:document.querySelector('#category').value,createdAt:serverTimestamp(),status:'pending'};
  if(mediaPath){submission.mediaPath=mediaPath;submission.mediaType=selectedFile.type;}
  await addDoc(collection(db,'submissions'),submission);
  e.target.reset();selectedFile=null;document.querySelector('#file-label').textContent='Attach image or video';
  msg.textContent='Received. Your submission is waiting for review.';msg.className='form-message success';
 }catch(err){console.error('Submission failed during '+stage,err);msg.textContent=`Submission failed during ${stage}: ${err.code||'unknown error'}${err.message?` — ${err.message}`:''}`;msg.className='form-message error';}
 finally{button.disabled=false;button.innerHTML='Send anonymously <span>↗</span>';}
});

async function loadFeed(){
 const feed=document.querySelector('#feed');
 if(!firebaseConfigured){feed.innerHTML='<div class="empty-state">Firebase connection pending.</div>';return;}
 feed.innerHTML='<div class="empty-state">Loading the gallery...</div>';
 try{
  const q=query(collection(db,'submissions'),where('status','==','approved'),orderBy('createdAt','desc'),limit(30));
  const snap=await getDocs(q); const docs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>activeFilter==='all'||x.category.toLowerCase()===activeFilter);
  if(!docs.length){feed.innerHTML='<div class="empty-state">Nothing here just yet.<br><span>Be the first to share something.</span></div>';return;}
  feed.innerHTML=docs.map(x=>`<article class="media-card">${x.publicMediaPath?`<div class="media-frame" data-path="${escapeHtml(x.publicMediaPath)}"><span class="media-loading">Loading media</span></div>`:''}<div class="media-meta"><span>${escapeHtml(x.category||'Random')}</span><span>ANONYMOUS</span></div>${x.caption?`<p>${escapeHtml(x.caption)}</p>`:''}</article>`).join('');
  for(const card of feed.querySelectorAll('.media-frame')){try{const url=await getDownloadURL(ref(storage,card.dataset.path));const doc=docs.find(x=>x.publicMediaPath===card.dataset.path);card.innerHTML=doc.mediaType?.startsWith('video/')?`<video controls playsinline preload="metadata" src="${url}"></video>`:`<img loading="lazy" src="${url}" alt="Anonymous submission" />`;}catch{card.innerHTML='<span class="media-loading">Media unavailable</span>';}}
 }catch(err){console.error(err);feed.innerHTML='<div class="empty-state">The gallery could not load.<br><span>Check Firestore indexes and security rules.</span></div>';}
}

const loginForm=document.querySelector('#admin-login');
const adminMessage=document.querySelector('#admin-message');
const dashboard=document.querySelector('#admin-dashboard');
const pendingList=document.querySelector('#pending-list');
function showAdminMessage(message,type=''){adminMessage.textContent=message;adminMessage.className=`form-message ${type}`;}
function renderAdminState(user){
 adminUser=user;
 loginForm.hidden=!!user;
 dashboard.hidden=!user;
 if(user) document.querySelector('#admin-status').textContent=`Signed in: ${user.email||'administrator'}`;
}
async function verifyAdmin(user){
 if(!user){renderAdminState(null);return;}
 // Anonymous visitors must keep their Firebase session so they can submit.
 // Only sign out authenticated, non-anonymous accounts that lack the admin claim.
 if(user.isAnonymous){renderAdminState(null);return;}
 try{
  const token=await user.getIdTokenResult(true);
  if(token.claims.admin!==true){await signOut(auth);renderAdminState(null);showAdminMessage('This account does not have administrator access.');return;}
  renderAdminState(user);
  await loadPending();
 }catch(error){console.error(error);renderAdminState(null);showAdminMessage('Could not verify administrator access.');}
}
onAuthStateChanged(auth,verifyAdmin);

loginForm.addEventListener('submit',async e=>{
 e.preventDefault();
 const button=document.querySelector('#admin-login-button');
 button.disabled=true;button.textContent='Signing in...';showAdminMessage('');
 try{
  await signInWithEmailAndPassword(auth,document.querySelector('#admin-email').value.trim(),document.querySelector('#admin-password').value);
  const user=auth.currentUser;
  const token=await user.getIdTokenResult(true);
  if(token.claims.admin!==true){await signOut(auth);showAdminMessage('This account is not authorised as an administrator.');}
 }catch(error){console.error(error);showAdminMessage(error.code==='auth/invalid-credential'?'Email or password is incorrect.':'Sign-in failed. Check the account and try again.','error');}
 finally{button.disabled=false;button.innerHTML='Sign in <span>↗</span>';}
});
document.querySelector('#admin-logout').addEventListener('click',()=>signOut(auth));

async function loadPending(){
 pendingList.innerHTML='<div class="empty-state">Loading pending submissions...</div>';
 try{
  // Keep this query on Firestore's automatic single-field index. Sorting locally
  // avoids requiring a composite (status + createdAt) index just to moderate.
  const q=query(collection(db,'submissions'),where('status','==','pending'),limit(50));
  const snap=await getDocs(q);
  const items=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
   const aTime=a.createdAt?.toMillis?.() ?? 0;
   const bTime=b.createdAt?.toMillis?.() ?? 0;
   return aTime-bTime;
  });
  if(!items.length){pendingList.innerHTML='<div class="empty-state">Queue clear.<br><span>No submissions waiting for review.</span></div>';return;}
  pendingList.innerHTML=items.map(x=>`<article class="pending-card" data-id="${escapeHtml(x.id)}">${x.mediaPath?`<div class="pending-preview" data-media-path="${escapeHtml(x.mediaPath)}" data-media-type="${escapeHtml(x.mediaType||'')}"><span>Loading private preview...</span></div>`:'<div class="pending-preview text-only-preview">TEXT ONLY SUBMISSION</div>'}<div class="pending-details"><div class="media-meta"><span>${escapeHtml(x.category||'Random')}</span><span>AWAITING REVIEW</span></div><p>${escapeHtml(x.caption||'No caption supplied.')}</p><small>Received ${x.createdAt?.toDate?x.createdAt.toDate().toLocaleString():'recently'}</small><div class="pending-actions"><button class="button primary" data-action="approve">Approve</button><button class="button quiet" data-action="reject">Reject</button></div></div></article>`).join('');
  for(const preview of pendingList.querySelectorAll('.pending-preview[data-media-path]')){
   try{const url=await getDownloadURL(ref(storage,preview.dataset.mediaPath));preview.innerHTML=preview.dataset.mediaType.startsWith('video/')?`<video controls playsinline preload="metadata" src="${url}"></video>`:`<img src="${url}" alt="Private submission preview" />`;}
   catch{preview.innerHTML='<span>Preview unavailable</span>';}
  }
 }catch(error){console.error(error);pendingList.innerHTML='<div class="empty-state">Could not load the moderation queue.<br><span>Check administrator claims and Firestore permissions.</span></div>';}
}
pendingList.addEventListener('click',async e=>{
 const button=e.target.closest('[data-action]');if(!button)return;
 const card=button.closest('[data-id]');if(!card||!adminUser)return;
 const id=card.dataset.id, action=button.dataset.action;
 card.querySelectorAll('button').forEach(b=>b.disabled=true);
 button.textContent=action==='approve'?'Approving...':'Rejecting...';
 try{
  await (action==='approve'?approveSubmission({submissionId:id}):rejectSubmission({submissionId:id}));
  card.remove();
  if(!pendingList.querySelector('.pending-card'))pendingList.innerHTML='<div class="empty-state">Queue clear.<br><span>No submissions waiting for review.</span></div>';
  if(action==='approve')loadFeed();
 }catch(error){console.error(error);card.querySelectorAll('button').forEach(b=>b.disabled=false);button.textContent=action==='approve'?'Approve':'Reject';alert(error.message||'Moderation action failed.');}
});
loadFeed();
