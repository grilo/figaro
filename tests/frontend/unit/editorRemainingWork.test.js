import { Compartment, EditorState, StateField, StateEffect } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { ensureSyntaxTree, indentUnit } from '@codemirror/language';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { livePreviewPlugin, markdownStylePlugin, linkPlugin, mouseSelectingField, shouldShowSource, collapseOnSelectionFacet } from '../../../frontend/vendored/codemirror-live-markdown/index.js';
import { referenceLinkPlugin } from '../../../frontend/js/referenceLinks.js';
import { createDiagramField } from '../../../frontend/js/liveDiagramPlugin.js';
import { mathField } from '../../../frontend/js/mathPlugin.js';
import { createFrontmatterField } from '../../../frontend/js/frontmatterPlugin.js';
import { inlineWritingState, setInlineWriting, openInlineWriting } from '../../../frontend/js/writingInline.js';
import { validateMermaidSource } from '../../../frontend/js/diagramRenderer.js';
import { collectMarkdownDocumentDiagnostics } from '../../../frontend/js/usecases/markdownDocumentLint.js';
import { createEditorLinkCompletions } from '../../../frontend/js/editorLinkCompletions.js';
import { indentationMarkers } from '../../../frontend/vendored/@replit/codemirror-indentation-markers/dist/index.js';
import { markdownWorkFacet } from '../../../frontend/vendored/codemirror-live-markdown/index.js';

function makeView(source,extensions,visibleEnd=source.length) {
 const control=new Compartment();let state=EditorState.create({doc:source,extensions:[markdownLanguage,mouseSelectingField,collapseOnSelectionFacet.of(true),...extensions,control.of([])]});
 ensureSyntaxTree(state,source.length,10000);state=state.update({}).state;
 const view=new EditorView({state,parent:document.body});
 Object.defineProperty(view,'visibleRanges',{configurable:true,get:()=>[{from:0,to:Math.min(visibleEnd,view.state.doc.length)}]});
 view.dispatch({effects:control.reconfigure([])});return view;
}
function instrument(object,keys,count) { for(const key of keys){const value=object[key];Object.defineProperty(object,key,{configurable:true,get(){count(key);return value;}});} }
test.each([10,1000])('format marker selection work with %i formatted paragraphs',count=>{
 const source='Prose paragraph.\n\n'+Array(count).fill('**Bold** text.\n\n').join('');
 const view=makeView(source,[livePreviewPlugin]);const plugin=view.plugin(livePreviewPlugin);
 let reads=0;for(const marker of plugin.markers)instrument(marker,['block'],()=>reads++);
 const before=plugin.decorations;
 for(let i=0;i<20;i++)view.dispatch({selection:{anchor:2+i%2}});
 expect(reads).toBe(0);
 expect(plugin.decorations).toBe(before);view.destroy();
});
test.each([10,1000])('typing invalidation for %i visible links',count=>{
 const source='Prose paragraph.\n\n'+Array(count).fill('[label](Target.md)\n\n').join('');const counters={};
 const view=makeView(source,[linkPlugin(),referenceLinkPlugin(),livePreviewPlugin,markdownStylePlugin,markdownWorkFacet.of((key,n=1)=>counters[key]=(counters[key]||0)+n)]);
 for(const key of Object.keys(counters))delete counters[key];
 for(let i=0;i<20;i++)view.dispatch({changes:{from:2,insert:'x'},selection:{anchor:3},userEvent:'input.type'});
 for(const key of ['source.slices.links','syntax.nodes.links','syntax.nodes.markers','syntax.nodes.styles']) expect(counters[key] || 0).toBe(0);
 expect(counters['syntax.nodes.inlineEdit']).toBeLessThan(100);view.destroy();
});
test.each([10,1000])('diagram projection after unrelated typing with %i blocks',count=>{
 const field=createDiagramField(StateField,EditorView,Decoration,WidgetType,shouldShowSource,mouseSelectingField);
 const source='Prose paragraph.\n\n'+Array(count).fill('```mermaid\ngraph LR; A-->B\n```\n\n').join('');
 let state=EditorState.create({doc:source,selection:{anchor:2},extensions:[mouseSelectingField,collapseOnSelectionFacet.of(true),field]});
 const original=Decoration.replace;let replacements=0;
 const spy=jest.spyOn(Decoration,'replace').mockImplementation(spec=>{if(spec.widget?.constructor.name==='DiagramWidget')replacements++;return original(spec);});
 for(let i=0;i<20;i++)state=state.update({changes:{from:2,insert:'x'},selection:{anchor:3},userEvent:'input.type'}).state;
 expect(replacements).toBe(0);
 expect(state.field(field).blocks).toHaveLength(count);spy.mockRestore();
});
test.each([10,1000])('math remapping cost with %i blocks',count=>{
 const source='Prose paragraph.\n\n'+Array(count).fill('$x+y$\n\n').join('');
 let state=EditorState.create({doc:source,selection:{anchor:2},extensions:[mathField]});
 let unchangedIndex=0,rangeReads=0;
 for(const range of state.field(mathField).ranges)instrument(range,['from','to'],()=>rangeReads++);
 for(let i=0;i<20;i++){
  const value=state.field(mathField),before=value.revealIndex;
  state=state.update({changes:{from:state.doc.length,insert:'x'},selection:{anchor:3},userEvent:'input.type'}).state;
  if(state.field(mathField).revealIndex===before)unchangedIndex++;
 }
 expect(rangeReads).toBe(0); expect(unchangedIndex).toBe(20);
});
test.each([10,1000])('frontmatter parsing on body edits with %i metadata entries',count=>{
 const field=createFrontmatterField(StateField,StateEffect,EditorView,Decoration,WidgetType,null);
 const source='---\n'+Array.from({length:count},(_,i)=>`key${i}: value\n`).join('')+'---\n\nBody prose.';
 let state=EditorState.create({doc:source,selection:{anchor:source.length},extensions:[field]});
 let sameMetadata=0,slices=0,characters=0;
 for(let i=0;i<20;i++){
  const before=state.field(field).frontmatter;
  const transaction=state.update({changes:{from:state.doc.length,insert:'x'},selection:{anchor:state.doc.length+1}});
  const doc=transaction.newDoc,original=doc.sliceString;
  const spy=jest.spyOn(doc,'sliceString').mockImplementation(function(from,to,...args){slices++;characters+=to-from;return original.call(this,from,to,...args);});
  state=transaction.state;if(state.field(field).frontmatter===before)sameMetadata++;spy.mockRestore();
 }
 expect(sameMetadata).toBe(20);expect(slices).toBe(0);expect(characters).toBe(0);
});
test.each([10,10000])('code indentation scope checks for %i lines with fixed viewport',count=>{
 const seen=new WeakSet();let mapHas=0;
 const originalSet=Map.prototype.set,originalHas=Map.prototype.has;
 const set=jest.spyOn(Map.prototype,'set').mockImplementation(function(k,v){if(v?.line&&typeof v.level==='number'&&typeof v.empty==='boolean')seen.add(this);return originalSet.call(this,k,v);});
 const has=jest.spyOn(Map.prototype,'has').mockImplementation(function(k){if(seen.has(this))mapHas++;return originalHas.call(this,k);});
 const source='root\n'+Array(count).fill('    item()\n').join('')+'end\n';
 const extension=indentationMarkers({highlightActiveBlock:true,markerType:'codeOnly'});
 const view=makeView(source,[indentUnit.of('    '),extension],50);
 mapHas=0;for(let i=0;i<20;i++)view.dispatch({selection:{anchor:i%2?7:18}});
 expect(mapHas).toBeLessThan(300);
 view.destroy();has.mockRestore();set.mockRestore();
});
test.each([10,100])('linting rereads %i unchanged Mermaid blocks',async count=>{
 const source='Ordinary prose.\n\n'+Array.from({length:count},(_,i)=>'```mermaid\ngraph LR; A'+i+'-->B\n```\n\n').join('');
 const previous=window.mermaid, parse=jest.fn().mockResolvedValue({diagramType:'flowchart-v2'});
 window.mermaid={initialize:jest.fn(),render:jest.fn(),parse};
 try {
  for(let i=0;i<5;i++)await collectMarkdownDocumentDiagnostics(source+'x'.repeat(i),validateMermaidSource);
  expect(parse).toHaveBeenCalledTimes(count);
 } finally {window.mermaid=previous;}
});
test.each([100,100000])('completion activators read prefixes of %i characters',count=>{
 const completion=createEditorLinkCompletions({getFileTree:()=>[],searchNotes:async()=>({results:[]}),getActiveTab:()=>null,getLinkStyle:()=> 'markdown',createLinkedNote:()=>{}});
 const view=makeView('x'.repeat(count),[completion.headingLinkCompletionActivator,completion.hashtagCompletionActivator]);
 view.dispatch({changes:{from:view.state.doc.length,insert:'x'},selection:{anchor:view.state.doc.length+1},userEvent:'input.type'});
 let characters=0,slices=0;
 const read=jest.spyOn(Object.getPrototypeOf(view.state.doc),'sliceString');const original=read.getMockImplementation();
 // Observe the real method via the saved original implementation provided by the spy.
 read.mockImplementation(function(from=0,to=this.length,...rest){characters+=to-from;slices++;return original.apply(this,[from,to,...rest]);});
 for(let i=0;i<20;i++)view.dispatch({changes:{from:view.state.doc.length,insert:'x'},selection:{anchor:view.state.doc.length+1},userEvent:'input.type'});
 expect(slices).toBe(40);expect(characters).toBe(40); // Only the newly inserted character per activator.
 read.mockRestore();view.destroy();
});

test.each([10,1000])('current writing range tree with %i offscreen results',count=>{
 const source='x'.repeat(200+count*10);
 const findings=Array.from({length:count},(_,i)=>({id:`f${i}`,kind:'spelling',from:100+i*10,to:104+i*10}));
 const view=makeView(source,[inlineWritingState],40);
 const current={id:'note',revision:1,configuration:'default',source};
 view.dispatch({effects:setInlineWriting.of({snapshot:{current,analyzed:current,inlineFindings:findings},actions:{}})});
 const initial=view.state.field(inlineWritingState);let reads=0;
 for(const finding of findings)instrument(finding,['from','to'],()=>reads++);
 for(let i=0;i<20;i++){
  view.dispatch({selection:{anchor:2+i%2}});
  expect(openInlineWriting(view)).toBe(true);
  initial.decorations.between(i%2,40+i%2,()=>{throw new Error('unexpected offscreen range');});
 }

 expect(reads).toBe(0);expect(view.state.field(inlineWritingState)).toBe(initial);view.destroy();
});
