// QA instrumentation only: inject into a Go build overlay with a disposable vault.
// Opens and edits Welcome.md; never load this against a personal vault.

import { createWritingAdapters } from '/js/writingAdapters.js';
import { createWritingResultsView } from '/js/views/writingResultsView.js';
const report={runtime:navigator.userAgent, measures:[], errors:[]};
try {
  while(!window._appReady) await new Promise(r=>setTimeout(r,10));
  report.appReadyMs=performance.now();
  document.querySelector('.file-tree-item[data-path="Welcome.md"] > .file-tree-node').click();
  while(!document.querySelector('.cm-content')) await new Promise(r=>setTimeout(r,10));
  document.getElementById('writing-lenses-toggle').click();
  const native=window.go.desktop.App;
  const init=performance.now(), ports=createWritingAdapters(native);
  await ports.ready; report.cachedWorkerInitMs=performance.now()-init;
  const preferences={lenses:['plain','direct','repetition'],language:'en-US'};
  const results=createWritingResultsView({onRetry(){},onNavigate(){},onDismiss(){},onApply(){}});
  document.querySelector('#right-sidebar-content').append(results.element);
  const sentence='The report was written in order to help the team utilize ordinary words for readers.';
  for(const words of [1000,10000]) {
    const source=Array(Math.ceil(words/15)).fill(sentence).join('\n\n');
    const runs=[];
    for(let i=0;i<3;i++) {
      const start=performance.now();
      const data=await ports.retext.analyze(source); const analyzed=performance.now();
      const raw=await ports.vale.analyze(`bench-${words}-${i}`,data.projection.text); const nativeDone=performance.now();
      const job={id:'benchmark',revision:i,configuration:String(words),source,language:'en-US',preferences,spelling:{enabled:false,words:[]}};
      const {result:value}=await ports.review.resolve({job,valeOutput:raw}); const resolved=performance.now();
      results.update({...value,current:{id:'benchmark',revision:i,configuration:String(words),language:'en-US',preferences,spelling:{enabled:false}},states:{retext:'complete',vale:'complete'}});
      await new Promise(requestAnimationFrame);
      runs.push({retextMs:analyzed-start,valeMs:nativeDone-analyzed,resolveMs:resolved-nativeDone,renderFrameMs:performance.now()-resolved,findings:value.count,evidence:value.evidence.length});
    }
    report.measures.push({words,runs});
  }
  const view=document.querySelector('.cm-content').cmTile.root.view;
  report.typingFrameMs=[];
  const large=Array(667).fill(sentence).join('\n\n');
  view.dispatch({changes:{from:0,to:view.state.doc.length,insert:large}});
  const inflight=ports.retext.analyze(large);
  for(let i=0;i<30;i++) {
    const start=performance.now();
    view.dispatch({changes:{from:view.state.doc.length,insert:'x'},userEvent:'input.type'});
    await new Promise(requestAnimationFrame); report.typingFrameMs.push(performance.now()-start);
    await new Promise(r=>setTimeout(r,20));
  }
  await inflight;
  const spellStart=performance.now();
  report.spelling=await ports.spelling('teh teh and ordinary words.', 'en-US'); report.coldSpellingMs=performance.now()-spellStart;
  ports.destroy();
  await native.CreateFile('Writing-benchmark.json',JSON.stringify(report,null,2));
  document.title='Writing benchmark complete';
} catch(error) { report.errors.push(error.message+"\n"+error.stack); await window.go.desktop.App.CreateFile('Writing-benchmark-error.json',JSON.stringify(report,null,2)); }
