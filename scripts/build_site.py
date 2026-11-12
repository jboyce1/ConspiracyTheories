#!/usr/bin/env python3
"""Rebuild a portable course site from the local SharePoint archive."""
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import unquote, urlparse, quote
import re, json, hashlib, zipfile, html, shutil
ROOT=Path(__file__).resolve().parents[1]; RAW=ROOT/'SharePoint_Raw'; OUT=ROOT; BASE='/ConspiracyTheories/'
for d in ['assets/files','assets/images','assets/css','assets/js','lessons']: (OUT/d).mkdir(parents=True,exist_ok=True)
def slug(s):return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
def norm(s):return re.sub(r'[^a-z0-9]','',s.lower())
assets=[]; hashes={}
def asset(name,data,group):
 digest=hashlib.sha256(data).hexdigest()
 if digest in hashes:return hashes[digest]
 rel=f'assets/{group}/{slug(Path(name).stem)}{Path(name).suffix.lower()}'
 if (OUT/rel).exists() and (OUT/rel).read_bytes()!=data:rel=f'assets/{group}/{slug(Path(name).stem)}-{digest[:6]}{Path(name).suffix.lower()}'
 (OUT/rel).write_bytes(data); hashes[digest]=rel;return rel
for f in sorted(RAW.rglob('*')):
 if f.suffix.lower() in ['.docx','.pptx','.mp4','.mp3']:
  rel=asset(f.name,f.read_bytes(),'files');assets.append((str(f.relative_to(RAW)),f.name,rel))
with zipfile.ZipFile(RAW/'SharePoint_Downloads/SitePages.zip') as z:
 for name in z.namelist():
  if name.endswith('/'):continue
  rel=asset(name,z.read(name),'images' if Path(name).suffix.lower() in ['.jpg','.png','.jpeg'] else 'files');assets.append((name,Path(name).name,rel))
files=sorted(RAW.glob('*.html')); lessons=[]; oldpages={}; issues=[]
for f in files:
 code,title=f.stem.split(' ',1); key=slug(f.stem); s=BeautifulSoup(f.read_text(),'html.parser')
 for a in s.find_all('a',href=True):
  if a.get_text(' ',strip=True)==f.stem:oldpages[urlparse(a['href']).path.lower()]=BASE+'lessons/'+key+'.html'
 lessons.append({'code':code,'title':title,'slug':key,'source':f,'soup':s})
def match(name):
 n=norm(Path(unquote(name)).stem)
 exact=[a for a in assets if norm(Path(a[1]).stem)==n]
 if exact:return exact[0][2]
 candidates=[a for a in assets if n and (n in norm(Path(a[1]).stem) or norm(Path(a[1]).stem) in n)]
 return candidates[0][2] if len({a[2] for a in candidates})==1 else None
def relevant(l):
 code=l['code']; needles={'M3.6':['3.6 If Then'],'M3.7':['3.7 Whistle'],'M3.8':['3.8 Conspiracy'],'M3.2':['SitePages/DevelopTheories'],'M3.1':['SitePages/PreliminaryResearch'],'M3.3':['M3.3','SitePages/KeyAssumptions'],'M2.1a':['M2.1a','SitePages/DecisionMaking'],'M1.2':['M1.2'],'M1.1':['M1.1']}.get(code,[code])
 return list(dict.fromkeys((name,rel) for path,name,rel in assets if any(n in path for n in needles)))
def clean(node,f):
 b=BeautifulSoup(str(node),'html.parser')
 for e in b(['script','style','button','input']):e.decompose()
 for e in b.find_all(True):
  keep={k:v for k,v in e.attrs.items() if k in ['href','src','alt','colspan','rowspan','id','scope']}
  if re.search(r'margin-left:\s*40px',e.get('style','')): keep['class']=['indented']
  e.attrs=keep
  if e.name=='a' and e.get('href'):
   u=urlparse(e['href']); path=unquote(u.path)
   if 'sharepoint.com' in u.netloc:
    target=oldpages.get(u.path.lower())
    if target:e['href']=target+('#'+u.fragment if u.fragment else '')
    elif '/sites/ConspiracyTheories'==u.path.rstrip('/'):e['href']=BASE
    else:
     target=match(Path(path).name)
     if target:e['href']=BASE+target
     else:issues.append({'page':f.stem,'label':e.get_text(' ',strip=True),'url':e['href']})
  if e.name=='img':
   src=e.get('src',''); local=f.parent/unquote(src)
   if local.is_file():e['src']=BASE+asset(local.name,local.read_bytes(),'images')
   else:
    target=match(Path(urlparse(src).path).name)
    if target:e['src']=BASE+target
    else:e.decompose()
 return ''.join(str(x) for x in b.contents)
def format_lesson(content,l):
 b=BeautifulSoup(content,'html.parser')
 # Remove saved editor controls and blank spacer paragraphs.
 for e in list(b.select('a')):
  if not e.get_text(strip=True) and not e.find('img'):e.decompose()
 for e in list(b.select('span,div')):
  e.unwrap()
 for e in list(b.select('p,h2,h3,h4')):
  if not e.get_text(strip=True) and not e.find(['img','video','audio']):e.decompose()
 blocks=b.select('.lesson-block')
 if blocks:
  first=blocks[0].find(['h2','h3'])
  if first and (norm(first.get_text())==norm(l['title']) or l['code']=='M2.1a'):first.decompose()
 # Top-level activities belong in the section index; supporting details do not.
 major={
  'M1.2':['Lecture Outline: The Psychological Struggle of Having Beliefs Questioned','Discussion Rules:','Assignment: Demonstrating Heuristics in Action','Tricks of the Trade: Heuristics','Additional discussion:'],
  'M3.3':['Example 1','Example 2'],
  'M3.4':['Evidence Discussion'],
  'M3.5':['Evidence Discussion','The Fog of Misinformation: From Authoritarian Regimes to Middle School Corridors'],
  'M3.6':['If-Then Analysis Exercise'],
  'M3.7':['Historical Case Studies',"Hypothetical Analysis – Hitler's Survival Theory"]
 }
 for h in b.select('h2,h3,h4,p'):
  text=' '.join(h.get_text(' ',strip=True).split())
  if text in major.get(l['code'],[]):h.name='h2'
  if h.name=='h2' and l['code']=='M1.1' and text.lower() in ['conspiracy','conspire','theory','law']:h.name='h3'
  if h.name=='p' and re.match(r'^Module\s*\d.*Class\s*\d',text):h.name='h3'
  if h.name=='p' and text.startswith('Exit Ticket:'):
   title=b.new_tag('h2');title.string='Exit Ticket';h.insert_before(title)
  if h.name=='p' and text.rstrip(':') in ['Objectives','Essential Question','Overarching Question','Standards','Goal','Concepts (lecture)']:
   h.name='h3'
 # Restore objectives written as ~ paragraphs to real, indented lists.
 for block in b.select('.lesson-block'):
  current=None
  for e in list(block.find_all('p',recursive=False)):
   text=e.get_text(' ',strip=True)
   if text.startswith('~'):
    if current is None:
     current=b.new_tag('ul');current['class']='objectives-list';e.insert_before(current)
    e.name='li'
    e.string=text.lstrip('~').strip();current.append(e.extract())
   else:current=None
 # Keep the text under each major heading together with a modest indent.
 for section in list(b.select('.lesson-block')):
  section.unwrap()
 grouped=b.new_tag('div');grouped['class']='lesson-content'
 body=None
 for e in list(b.contents):
  if getattr(e,'name',None)=='h2':
   section=b.new_tag('section');section['class']='content-section';grouped.append(section)
   section.append(e.extract());body=b.new_tag('div');body['class']='section-body';section.append(body)
  elif body is not None:body.append(e.extract())
  else:grouped.append(e.extract())
 for section in grouped.select('.section-body'):
  for h in section.select('h3'):
   h['class']=list(h.get('class',[]))+['detail-heading']
 return str(grouped)

def lesson_art(l):
 # Match the original SharePoint banner to its archived asset, including blob images.
 img=l['soup'].select_one('[data-sp-originalimgsrc]')
 if not img:return ''
 name=Path(unquote(img['data-sp-originalimgsrc'])).name
 target=next((rel for path,n,rel in assets if n==name),None)
 if not target:return ''
 diagrams={'M3.1','M3.2','M3.3','M3.4','M3.5','M3.6','M3.7','M3.8'}
 alt='Conspiracy theory analysis workflow' if l['code'] in diagrams else ('Conspiracy theories course illustration' if l['code'].startswith('M2') else 'Original lesson artwork')
 return f'<figure class="course-art"><a href="{BASE}{target}" aria-label="Open full-size image: {alt}"><img src="{BASE}{target}" alt="{alt}" loading="lazy"></a></figure>'

def shell(title,body,key=''):
 nav='<h1><a href="'+BASE+'">Conspiracy<br>Theories</a></h1><p class="nav-caption">Research • Evidence • Analysis</p>'
 for module,label in [('M1','Belief & perception'),('M2','Choosing a theory'),('M3','Investigating claims')]:
  nav+=f'<h2 class="nav-label">{module} · {label}</h2>'
  for l in lessons:
   if l['code'].startswith(module):nav+=f'<a {"aria-current=\"page\"" if key==l["slug"] else ""} href="{BASE}lessons/{l["slug"]}.html"><small>{l["code"]}</small> {html.escape(l["title"])}</a>'
 nav+=f'<h2 class="nav-label">Resources</h2><a href="{BASE}resources.html">Course downloads</a><a href="{BASE}">Course overview</a>'
 return f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Conspiracy Theories: a course in research, evidence, and structured analysis."><title>{html.escape(title)} | Conspiracy Theories</title><link rel="stylesheet" href="{BASE}assets/css/styles.css"><script defer src="{BASE}assets/js/site.js"></script></head><body><a class="skip-link" href="#main">Skip to content</a><nav class="course-nav" aria-label="Course">{nav}</nav><nav id="left-nav" aria-label="On this page"><h2>Lines of Inquiry</h2><ul id="toc"></ul></nav><main id="main" class="main-content">{body}<footer>Conspiracy Theories · Jacob Boyce</footer></main></body></html>'
for i,l in enumerate(lessons):
 f=l['source']; content=f'<p class="eyebrow">{l["code"]} · Conspiracy Theories</p><h1>{html.escape(l["title"])}</h1>'+lesson_art(l)
 for control in l['soup'].select('[data-automation-id="CanvasControl"]'):
  if control.select('[data-sp-feature-tag="PageTitle web part (Banner)"]'):continue
  blocks=control.select('.ck-content')
  if blocks:
   for b in blocks:
    if b.find_parent(class_='ck-content'):continue
    content+='<section class="lesson-block">'+clean(b,f)+'</section>'
  else:
   for e in control.select('[aria-label]'):
    label=e.get('aria-label','');m=re.match(r'(.+?\.(?:docx|pptx|pdf|mp4|mp3))\.',label)
    if m and (target:=match(m[1])):content+=f'<p class="file-card"><a href="{BASE}{target}">{html.escape(m[1])}</a></p>'
   for a in control.select('a[href]'):content+=clean(a,f)
 content=format_lesson(content,l)
 local=relevant(l)
 content+='<h2>Lesson downloads</h2><ul class="download-list">'
 for name,rel in local:content+=f'<li><a href="{BASE}{rel}">{html.escape(Path(name).stem)}</a> <small>{Path(name).suffix[1:].upper()}</small></li>'
 pdf=asset(f.with_suffix('.pdf').name,f.with_suffix('.pdf').read_bytes(),'files')
 content+=f'<li><a href="{BASE}{pdf}">Original lesson · printable PDF</a></li></ul>'
 for name,rel in local:
  if rel.endswith(('.mp4','.mp3')):
   tag='video' if rel.endswith('.mp4') else 'audio';content+=f'<h3>{html.escape(Path(name).stem)}</h3><{tag} controls preload="metadata" src="{BASE}{rel}"></{tag}>'
 content+='<div class="lesson-pagination">'
 if i:content+=f'<a href="{BASE}lessons/{lessons[i-1]["slug"]}.html">← {lessons[i-1]["code"]}: {html.escape(lessons[i-1]["title"])}</a>'
 if i+1<len(lessons):content+=f'<a href="{BASE}lessons/{lessons[i+1]["slug"]}.html">{lessons[i+1]["code"]}: {html.escape(lessons[i+1]["title"])} →</a>'
 content+='</div>'
 (OUT/'lessons'/f'{l["slug"]}.html').write_text(shell(l['title'],content,l['slug']))
body='<figure class="course-art home-art"><img src="'+BASE+'assets/images/46479-conspiracy-theoy-choice.jpg" alt="Course illustration combining moon landings, lizard people, and historical conspiracy imagery"></figure><p class="eyebrow">A course in critical thinking</p><h1>Conspiracy Theories</h1><p class="lead">Follow the claim. Question the assumptions. Test the evidence.</p><p>Explore how beliefs form, how people make decisions, and how structured analysis helps us evaluate competing explanations. Build a research project and a series of recorded episodes, from your first question to your final conclusion.</p><a class="button-link" href="'+BASE+'lessons/'+lessons[0]['slug']+'.html">Begin with Conspiracies Everywhere →</a><h2>The course</h2>'
for prefix,title,desc in [('M1','Belief & perception','Examine conspiracy theories, perception, cognitive biases, and the limits of belief.'),('M2','Choosing a theory','Analyze decisions and select a claim to investigate.'),('M3','Investigating claims','Gather sources, develop competing theories, test assumptions, evaluate evidence, and present your conclusion.')]:
 body+=f'<h2>{prefix} · {title}</h2><p>{desc}</p><ul class="agenda-list">'
 for l in lessons:
  if l['code'].startswith(prefix):body+=f'<li><a href="{BASE}lessons/{l["slug"]}.html">{l["code"]} · {html.escape(l["title"])}</a></li>'
 body+='</ul>'
body+='<h2>Working with evidence</h2><p>The theories in this course are subjects for investigation. Compare sources, consider alternative explanations, and distinguish a claim from the evidence supporting it.</p>'
(OUT/'index.html').write_text(shell('Course overview',body))
body='<p class="eyebrow">Reference library</p><h1>Course downloads</h1>'
for l in lessons:
 body+=f'<h2>{l["code"]} · {html.escape(l["title"])}</h2><ul class="download-list">'
 for name,rel in relevant(l):body+=f'<li><a href="{BASE}{rel}">{html.escape(Path(name).stem)}</a></li>'
 body+='</ul>'
body+='<h2>Analysis of Competing Hypotheses</h2><ul>'
for path,name,rel in assets:
 if 'M3.0' in path and 'SharePoint_Downloads' not in path:body+=f'<li><a href="{BASE}{rel}">{html.escape(name)}</a></li>'
body+='</ul>'
(OUT/'resources.html').write_text(shell('Course downloads',body));(OUT/'.nojekyll').touch()
(ROOT/'migration-report.json').write_text(json.dumps({'lessons':len(lessons),'unique_assets':len(hashes),'unresolved_sharepoint_links':issues},indent=2))
print('Built',len(lessons),'lessons;',len(hashes),'unique assets;',len(issues),'unresolved SharePoint links')
