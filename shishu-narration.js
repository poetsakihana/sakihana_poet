'use strict';
let narrator={queue:[],index:0,running:false,paused:false,opening:false,token:0,cancelWait:null,initialized:false,autoPrepare:false,skipped:0};
function buildNarrationQueue(author='all'){const rank=new Map([['ユーザー',-1],...AUTHORS.map((a,i)=>[a.name,i])]);return catalog.filter(b=>author==='all'||b.collection===author).slice().sort((a,b)=>(rank.get(a.collection)-rank.get(b.collection))||a.id.localeCompare(b.id,'en',{numeric:true})).flatMap(b=>b.pages.map((p,i)=>({b,i})).filter(x=>isUnlocked(x.b,x.i)))}
function narrationStatus(text){$('#narration-status').textContent=text;$('#narration-reader-status').textContent=text}
function renderNarration(){const select=$('#narration-author'),old=select.value||'all';select.replaceChildren();for(const author of ['all','ユーザー',...AUTHORS.map(a=>a.name)]){const option=el('option',(author==='all'?'全て':author)+'（'+buildNarrationQueue(author).length+'作品）');option.value=author;select.append(option)}select.value=old;const count=buildNarrationQueue(select.value).length;$('#narration-count').textContent='解放済み '+count+'作品を順番に朗読します。';$('#start-narration').disabled=!count;}
function narrationLive(token){return narrator.running&&token===narrator.token}
function cancelNarrationWait(){if(narrator.cancelWait){const cancel=narrator.cancelWait;narrator.cancelWait=null;cancel()}if(window.speechSynthesis)window.speechSynthesis.cancel();if(typeof stopSpeech==='function')stopSpeech()}
function stopNarration(message='朗読を終了しました。',pause=false){narrator.token++;narrator.running=false;narrator.paused=pause;cancelNarrationWait();if(typeof duckMusic==='function')duckMusic(false);$('#pause-narration').textContent=pause?'再開':'最初から';if(!pause)$('#narration-controls').hidden=true;narrationStatus(message)}
function pauseNarration(){if(narrator.running)stopNarration('一時停止しました。再開すると、この作品のはじめから読みます。',true);else if(narrator.queue.length){if(narrator.index>=narrator.queue.length)narrator.index=0;runNarration()}}
function narrationWait(ms,token){return new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);if(narrator.cancelWait===cancel)narrator.cancelWait=null;resolve(narrationLive(token))},cancel=()=>finish(),timer=setTimeout(finish,ms);narrator.cancelWait=cancel})}
function sayNarration(text,token){const boundKey=speechKey(),boundSource=speechSource();return new Promise((resolve,reject)=>{const chunks=splitSpeech(text);let index=0;const cancel=()=>{if(narrator.cancelWait===cancel)narrator.cancelWait=null;resolve(false)};narrator.cancelWait=cancel;function next(){if(!narrationLive(token)){cancel();return}if(speechKey()!==boundKey||speechSource()!==boundSource){stopNarration('表示中の作品が変わったため、朗読を終了しました。');cancel();return}if(index>=chunks.length){narrator.cancelWait=null;resolve(true);return}const utterance=new window.SpeechSynthesisUtterance(chunks[index++]);utterance.lang='ja-JP';utterance.rate=Number(settings.narrationRate)||.9;const selectedVoice=window.speechSynthesis.getVoices().find(v=>v.voiceURI===$('#speech-voice').value);if(selectedVoice)utterance.voice=selectedVoice;utterance.onend=next;utterance.onerror=e=>{if(!narrationLive(token)){cancel();return}narrator.cancelWait=null;reject(Error(e.error==='voice-unavailable'?'端末に日本語音声を追加してください。':'音声を再生できませんでした。再開または次の作品へ進んでください。'))};window.speechSynthesis.speak(utterance)}next()})}
function narrationPoemName(entry){const name=prettyTitle(entry.b.pages[entry.i].title);return /^\d{8,}|_\d{8,}/.test(name)?'第'+(entry.i+1)+'作品':name}
function automaticNarrationText(text){return String(text||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()}
async function prepareNarrationBody(token){
 if(!speechTextMatchesSource())await recognizePage();
 if(!narrationLive(token))return '';
 if(!speechTextMatchesSource())throw Error('表示中の作品に対応する本文を読み取れませんでした。');
 const body=automaticNarrationText($('#speech-text').value);
 if(!body||!/[\p{L}\p{N}]/u.test(body))throw Error('本文を読み取れませんでした。');
 if(!narrator.autoPrepare&&!speechTextVerified()){$('#speech-panel').open=true;throw Error('画像と本文を見比べて、必要なら修正し、「確認して朗読を続ける」を押してください。')}
 return body;
}
async function runNarration(){
 if(narrator.running||!narrator.queue.length)return;
 if(!speechSupported){narrationStatus('この端末では音声読み上げを利用できません。');return}
 cancelNarrationWait();narrator.running=true;narrator.paused=false;let consecutiveFailures=0;
 const token=++narrator.token;$('#narration-controls').hidden=false;$('#pause-narration').textContent='一時停止';
 if(typeof duckMusic==='function')duckMusic(true);
 try{while(narrationLive(token)){
  if(narrator.index>=narrator.queue.length){
   if(consecutiveFailures>=narrator.queue.length){stopNarration('本文を準備できる作品がありませんでした。画像・本文を確認してください。スキップ '+narrator.skipped+'作品。');return}
   if(settings.narrationRepeat)narrator.index=0;
   else{stopNarration('選んだ巻の解放済み作品を、最後まで朗読しました。スキップ '+narrator.skipped+'作品。');return}
  }
  const entry=narrator.queue[narrator.index];
  if(!isUnlocked(entry.b,entry.i)){narrator.index++;consecutiveFailures++;continue}
  narrationStatus((narrator.index+1)+' / '+narrator.queue.length+' · '+entry.b.collection+' · '+entry.b.title+' '+(entry.i+1)+'ページ：画像を調整し、本文を準備しています…');
  let body;
  try{
   narrator.opening=token;
   try{await openBook(entry.b,entry.i)}finally{if(narrator.opening===token)narrator.opening=false}
   if(!narrationLive(token))return;
   if(!ready||current?.id!==entry.b.id||page!==entry.i)throw Error('作品を開けませんでした。');
   body=await prepareNarrationBody(token);
  }catch(e){
   if(!narrationLive(token))return;
   if(!narrator.autoPrepare)throw e;
   narrator.skipped++;consecutiveFailures++;narrator.index++;
   narrationStatus('本文を準備できなかったため次へ進みます。'+e.message+' スキップ '+narrator.skipped+'作品。');
   if(!await narrationWait(500,token))return;
   continue;
  }
  if(!narrationLive(token))return;
  const heading=settings.narrationReadTitle?entry.b.collection+'。'+narrationPoemName(entry)+'。\n':'';
  narrationStatus((narrator.index+1)+' / '+narrator.queue.length+' · '+entry.b.collection+' · '+narrationPoemName(entry)+'を朗読中'+(!speechTextVerified()?'（OCR自動本文・未確認）':'')+' · スキップ '+narrator.skipped);
  if(!await sayNarration(heading+body,token))return;
  if(!narrationLive(token))return;
  consecutiveFailures=0;narrator.index++;
  if(!narrator.autoPrepare&&!settings.narrationAutoNext&&narrator.index<narrator.queue.length){stopNarration('1作品の朗読が終わりました。「再開」で次の作品を読みます。',true);return}
  if(narrator.index<narrator.queue.length||settings.narrationRepeat)if(!await narrationWait(Number(settings.narrationGap)*1000,token))return;
 }}catch(e){if(narrationLive(token))stopNarration(e.message,true)}
}
function startNarration(){stopNarration('',false);narrator.autoPrepare=$('#narration-auto-prepare').checked===true;narrator.skipped=0;narrator.queue=buildNarrationQueue($('#narration-author').value);narrator.index=0;if(!narrator.queue.length){narrationStatus('この巻には解放済みの作品がありません。ガチャで解放してください。');return}runNarration()}
function nextNarration(){if(!narrator.queue.length)return;stopNarration('',true);narrator.index++;if(narrator.index>=narrator.queue.length){stopNarration('最後の作品まで進みました。');return}runNarration()}
function initNarration(){if(narrator.initialized){renderNarration();return}narrator.initialized=true;$('#confirm-narration-text').onclick=()=>{const entry=narrator.queue[narrator.index];if(!narrator.paused||!entry||current?.id!==entry.b.id||page!==entry.i||currentSpeechPage!==speechKey()){setSpeechStatus('朗読対象の作品を開き直してください。');return}const text=$('#speech-text').value.trim();if(!text){setSpeechStatus('正しい本文を入力してください。');return}$('#speech-text').value=text;if(saveSpeechRecord(text,'confirmed',true))runNarration()};$('#speech-text').addEventListener('input',()=>{if(narrator.running)stopNarration('本文の編集中は朗読を一時停止します。',true)});renderNarration();$('#narration-author').onchange=renderNarration;$('#start-narration').onclick=startNarration;$('#pause-narration').onclick=pauseNarration;$('#next-narration').onclick=nextNarration;$('#stop-narration').onclick=()=>stopNarration();document.addEventListener('poetry:loading',()=>{if(narrator.running&&!narrator.opening)stopNarration('手動でページを移動したため、連続朗読を終了しました。')});document.addEventListener('poetry:closed',()=>{if(narrator.running||narrator.paused)stopNarration()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&narrator.running)stopNarration('画面を離れたため、一時停止しました。',true)});for(const id of ['speak','recognize','save-speech-text'])$('#'+id).addEventListener('click',()=>{if(narrator.running)stopNarration('本文の確認・読み上げ操作に切り替えました。',true)},true)}
