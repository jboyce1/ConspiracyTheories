import test from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, youtubeId, embeddedUrls, kind, isCoursePage, downloadTarget, compare } from './lib.mjs';
test('extracts the video URL hidden in SharePoint HTML-encoded web-part properties', () => {
 const canvas='<div data-sp-webpartdata="{&quot;properties&quot;:{&quot;embedCode&quot;:&quot;&lt;iframe src=\\&quot;https://www.youtube.com/embed/kwXcHq28m1E?si=test&amp;autoplay=0\\&quot;&gt;&lt;/iframe&gt;&quot;}}"></div>';
 const urls=embeddedUrls({CanvasContent1:canvas});
 assert.ok(urls.some(u=>youtubeId(u)==='kwXcHq28m1E'));
 assert.ok(embeddedUrls({embedCode:encodeURIComponent('<iframe src="https://youtu.be/newVideo123"></iframe>')}).some(u=>youtubeId(u)==='newVideo123'));
});
test('identifies existing vs missing video embeds across watch and embed URL forms',()=>{
 const rows=compare([{url:'https://youtu.be/kwXcHq28m1E',kind:'video'},{url:'https://www.youtube.com/watch?v=another-id',kind:'video'}],{videos:{'M3.3':{provider:'youtube',id:'kwXcHq28m1E'}}},[]);
 assert.deepEqual(rows.map(r=>r.status),['already-embedded','video-to-add']);
});
test('never records bearer tokens or signature parameters in resource URLs',()=>{
 const u=safeUrl('https://mypps.sharepoint.com/sites/ConspiracyTheories/movie.mp4?access_token=secret&sig=signature&download=1');
 assert.equal(u,'https://mypps.sharepoint.com/sites/ConspiracyTheories/movie.mp4?download=1');
 assert.equal(safeUrl('javascript:alert(1)'),null);
 assert.equal(safeUrl('blob:https://mypps.sharepoint.com/private'),null);
});
test('discovery stays inside the intended course and skips list administration pages',()=>{
 assert.equal(isCoursePage('https://mypps.sharepoint.com/sites/ConspiracyTheories/SitePages/KeyAssumptions.aspx'),true);
 assert.equal(isCoursePage('https://mypps.sharepoint.com/sites/Other/SitePages/Home.aspx'),false);
 assert.equal(isCoursePage('https://mypps.sharepoint.com/sites/ConspiracyTheories/SitePages/Forms/AllPages.aspx'),false);
 assert.equal(isCoursePage('https://example.org/sites/ConspiracyTheories/SitePages/Home.aspx'),false);
});
test('download converts sharing viewer links to same-site file endpoints and rejects external hosts',()=>{
 const t=downloadTarget('https://mypps.sharepoint.com/:w:/r/sites/ConspiracyTheories/Shared%20Documents/Teacher%27s%20Example.docx?web=1');
 assert.ok(t.api.includes("Teacher''s%20Example.docx")||decodeURIComponent(t.api).includes("Teacher''s Example.docx"));
 assert.match(t.filename,/\.docx$/);
 assert.equal(downloadTarget('https://example.org/handout.docx'),null);
 assert.equal(downloadTarget('https://mypps.sharepoint.com/sites/Other/handout.docx'),null);
 assert.equal(kind('https://mypps.sharepoint.com/_layouts/15/stream.aspx?id=test'),'video');
});
