import './style.css';
import { collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, firebaseConfigured, ensureAnonymousSession } from './firebase.js';

const app = document.querySelector('#app');
let activeFilter = 'all';
let selectedFile = null;
const escapeHtml = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories = ['All','Confessions','Photography','Memes','Videos','Random'];

app.innerHTML = `
<header class="topbar"><a class="brand" href="#"><span class="brand-mark">a.</span><span>anonyma</span></a><nav><a href="#explore">Explore</a><a href="#submit">Submit</a><a class="nav-admin" href="#admin">Admin</a></nav></header>
<main>
<section class="hero"><div class="eyebrow"><span class="pulse"></span> A SPACE WITHOUT NAMES</div><h1>Say it. Share it.<br><em>Leave your name out.</em></h1><p>A home for the things people want to share, without attaching an identity. Your voice, your moment, your choice.</p><div class="hero-actions"><a class="button primary" href="#submit">Share anonymously <span>↗</span></a><a class="button quiet" href="#explore">Explore the feed</a></div><div class="hero-note"><span>◉</span> No public profiles. No follower counts. Just content.</div></section>
<section class="submit-section" id="submit"><div class="section-head"><div><div class="eyebrow">YOUR SPACE</div><h2>Put it out there.</h2></div><span class="section-index">01 / SUBMIT</span></div>
<form id="submission-form" class="submit-card"><label class="field-label" for="caption">A caption or confession <span>OPTIONAL</span></label><textarea id="caption" maxlength="1200" placeholder="Get it off your chest..."></textarea><div class="form-row"><label class="select-wrap"><span class="field-label">CATEGORY</span><select id="category"><option>Confessions</option><option>Photography</option><option>Memes</option><option>Videos</option><option>Random</option></select></label><label class="upload-box" for="media"><span class="upload-icon">＋</span><span><strong id="file-label">Attach image or video</strong><small>Up to 100 MB</small></span><input id="media" type="file" accept="image/*,video/*" /></label></div><div class="form-bottom"><span class="privacy-note">◈ Your submission is reviewed before it goes public.</span><button class="button primary" type="submit" id="submit-button">Send anonymously <span>↗</span></button></div><p class="form-message" id="form-message" role="status"></p></form></section>
<section class="feed-section" id="explore"><div class="section-head"><div><div class="eyebrow">THE COMMUNITY</div><h2>Out in the open.</h2></div><span class="section-index">02 / EXPLORE</span></div><div class="filters" id="filters"></div><div class="feed-grid" id="feed"><div class="empty-state">The gallery is quiet for now.<br><span>Approved submissions will appear here.</span></div></div></section>
<section class="admin-section" id="admin"><div class="section-head"><div><div class="eyebrow">CONTROL ROOM</div><h2>Admin access.</h2></div><span class="section-index">03 / MODERATION</span></div><div class="admin-card"><p>Moderation is restricted to authenticated administrators with a Firebase custom claim. Public visitor sessions cannot access pending submissions.</p><p class="muted">Admin sign-in and review controls will be enabled after the first administrator account and custom claim are provisioned.</p></div></section>
</main><footer><a class="brand" href="#"><span class="brand-mark">a.</span><span>anonyma</span></a><span>Without a name. With a voice.</span><span>© ${new Date().getFullYear()} ANONYMA</span></footer>`;

const filters = document.querySelector('#filters');
filters.innerHTML = categories.map((c,i)=>`<button class="filter ${i===0?'active':''}" data-filter="${c.toLowerCase()}">${c}</button>`).join('');
filters.addEventListener('click', e => { const b=e.target.closest('[data-filter]'); if(!b)return; activeFilter=b.dataset.filter; filters.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b)); loadFeed(); });
document.querySelector('#media').addEventListener('change', e=>{selectedFile=e.target.files[0]||null;document.querySelector('#file-label').textContent=selectedFile?.name||'Attach image or video';});
document.querySelector('#submission-form').addEventListener('submit', async e=>{
 e.preventDefault(); const button=document.querySelector('#submit-button'), msg=document.querySelector('#form-message');
 if(!firebaseConfigured){msg.textContent='Firebase setup is not connected yet. The interface is ready; add the project configuration to enable submissions.';msg.className='form-message error';return;}
 if(!selectedFile){msg.textContent='Attach an image or video to continue.';msg.className='form-message error';return;}
 if(selectedFile.size>100*1024*1024){msg.textContent='That file is over the 100 MB limit.';msg.className='form-message error';return;}
 if(!selectedFile.type.startsWith('image/')&&!selectedFile.type.startsWith('video/')){msg.textContent='Only image and video files are accepted.';msg.className='form-message error';return;}
 button.disabled=true;button.textContent='Sending...';msg.textContent='';
 try{
  const user=await ensureAnonymousSession();
  const safeName=selectedFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=`submissions/${user.uid}/${Date.now()}-${safeName}`;
  await uploadBytes(ref(storage,path),selectedFile,{contentType:selectedFile.type});
  await addDoc(collection(db,'submissions'),{ownerUid:user.uid,caption:document.querySelector('#caption').value.trim(),category:document.querySelector('#category').value,mediaPath:path,mediaType:selectedFile.type,createdAt:serverTimestamp(),status:'pending'});
  e.target.reset();selectedFile=null;document.querySelector('#file-label').textContent='Attach image or video';
  msg.textContent='Received. Your submission is waiting for review.';msg.className='form-message success';
 }catch(err){console.error(err);msg.textContent=err.code==='storage/unauthorized'?'Upload blocked by storage security rules.':'Could not submit right now. Check Firebase setup and try again.';msg.className='form-message error';}
 finally{button.disabled=false;button.innerHTML='Send anonymously <span>↗</span>';}
});
async function loadFeed(){
 const feed=document.querySelector('#feed');
 if(!firebaseConfigured){feed.innerHTML='<div class="empty-state">Firebase connection pending.<br><span>The public feed will populate once the project is connected.</span></div>';return;}
 feed.innerHTML='<div class="empty-state">Loading the gallery...</div>';
 try{
  const q=query(collection(db,'submissions'),where('status','==','approved'),orderBy('createdAt','desc'),limit(30));
  const snap=await getDocs(q); const docs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>activeFilter==='all'||x.category.toLowerCase()===activeFilter);
  if(!docs.length){feed.innerHTML='<div class="empty-state">Nothing here just yet.<br><span>Be the first to share something.</span></div>';return;}
  feed.innerHTML=docs.map(x=>`<article class="media-card"><div class="media-frame" data-path="${escapeHtml(x.publicMediaPath || '')}"><span class="media-loading">Loading media</span></div><div class="media-meta"><span>${escapeHtml(x.category||'Random')}</span><span>ANONYMOUS</span></div>${x.caption?`<p>${escapeHtml(x.caption)}</p>`:''}</article>`).join('');
  for(const card of feed.querySelectorAll('.media-frame')){try{if(!card.dataset.path) throw new Error('Public media path missing');const url=await getDownloadURL(ref(storage,card.dataset.path));const doc=docs.find(x=>x.publicMediaPath===card.dataset.path);card.innerHTML=doc.mediaType?.startsWith('video/')?`<video controls playsinline preload="metadata" src="${url}"></video>`:`<img loading="lazy" src="${url}" alt="Anonymous submission" />`;}catch{card.innerHTML='<span class="media-loading">Media unavailable</span>';}}
 }catch(err){console.error(err);feed.innerHTML='<div class="empty-state">The gallery could not load.<br><span>Check Firestore indexes and security rules.</span></div>';}
}
loadFeed();
