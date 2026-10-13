"""Dependency-free static integrity and contrast checks. Not browser QA."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import json, re, xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent.parent
class Page(HTMLParser):
    def __init__(self): super().__init__(); self.ids=[]; self.refs=[]; self.h1=0; self.scripts=0; self.buttons=[]; self.text=[]
    def handle_data(self,data): self.text.append(data)
    def handle_starttag(self,t,attrs):
        d=dict(attrs)
        if 'id' in d:self.ids.append(d['id'])
        for a in ('href','src'):
            if a in d:self.refs.append(d[a])
        if t=='h1':self.h1+=1
        if t=='script':self.scripts+=1
        if t=='button':self.buttons.append(d)
p=Page();p.feed((root/'prototype.html').read_text())
refs=p.refs+re.findall(r'url\([\'\"]?([^\)\'\"]+)',(root/'prototype.css').read_text())
errors=[]
for ref in refs:
    u=urlsplit(ref)
    if u.scheme or u.netloc: errors.append('External reference: '+ref);continue
    target=root/u.path if u.path else root/'prototype.html'
    if not target.exists():errors.append('Missing file: '+ref)
    if u.fragment:
        ids=p.ids if not u.path else [el.attrib.get('id') for el in ET.parse(target).iter()]
        if u.fragment not in ids:errors.append('Missing fragment: '+ref)
for f in root.glob('*.svg'):ET.parse(f)
fixture=json.loads((root/'demo.fixture.json').read_text())
assert fixture['fixture'] is True
visible_text=' '.join(p.text)
count_patterns={'events':r'(\d+) synthetic events','dependencies':r'(\d+) synthetic fixtures','minimization':r'(\d+) synthetic attempts'}
label_counts={}
for key,pattern in count_patterns.items():
    match=re.search(pattern,visible_text)
    assert match, f'Missing visible count label for {key}'
    label_counts[key]=int(match.group(1))
    assert label_counts[key]==len(fixture[key]), f'Visible count differs from JSON for {key}'
assert len(p.ids)==len(set(p.ids)) and p.h1==1 and p.scripts==0
assert all('disabled' in b and 'aria-describedby' in b for b in p.buttons)
def luminance(c):
    v=[int(c[i:i+2],16)/255 for i in (1,3,5)]
    v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
    return sum(a*b for a,b in zip(v,(.2126,.7152,.0722)))
def ratio(a,b):
    a,b=sorted((luminance(a),luminance(b)));return round((b+.05)/(a+.05),2)
tokens=dict(re.findall(r'--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;', (root/'tokens.css').read_text()))
pair_tokens={'body':('ink','surface'),'muted':('muted','surface'),'link':('blue','surface'),'pass':('green','green-soft'),'fail':('red','red-soft'),'warning':('amber','amber-soft'),'neutral':('blue','blue-soft'),'muted-canvas':('muted','canvas')}
pairs={name:tuple(tokens[token] for token in names) for name,names in pair_tokens.items()}
contrast={k:ratio(*v) for k,v in pairs.items()}
assert all(v>=4.5 for v in contrast.values()),contrast
result={'static_checks_passed':not errors,'errors':errors,'local_reference_count':len(refs),'svg_xml_valid':True,'single_h1':True,'unique_ids':True,'no_javascript':True,'fixture_counts_match_visible_labels':True,'visible_counts':label_counts,'contrast_source':'Parsed current tokens.css semantic pairs; not computed browser styles','normal_text_contrast_minimum':4.5,'contrast_ratios':contrast,'browser_qa':'Blocked: Chromium launch fails with socket() Operation not permitted, including reviewed escalation. No screenshots or rendering claims.'}
(root/'qa'/'static-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
assert not errors
