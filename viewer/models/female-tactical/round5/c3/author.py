import json,shutil,hashlib
from pathlib import Path
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];A=D.parent/'c2-archive'
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
s=json.loads((M/'canonical-spec.json').read_text())['extensions']['babylon-sculpt-v1']['source'];old=json.loads(json.dumps(s));b={c['id']:c for c in s['componentTree']};assert not s.get('round5Correction3')
files=list((ROOT/'.img2babylon/shots').glob('round5-c2-*.png'))+list((ROOT/'.img2babylon/cli').glob('round5-c2-*.json'))+[D.parent/'c2/capture-handoff.json']
for f in files:shutil.copy2(f,A/f.name)
for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','iteration.json','round5/compile_surfaces.py']:shutil.copy2(M/n,A/(Path(n).name+'.snapshot'))
review={'passId':'blockout','round':5,'action':'refine-spec','summary':'C2 nose visually REJECTED: broad moustache-like dark shelf and sharp ridge in actual front/3q GPU. C3 nose-only correction; preserve C2 hair and brows. No passing visual score.','evidence':[str(f.relative_to(ROOT)) for f in files],'evidenceHashes':{str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in files},'desktopReported':{'views':11,'viewport':[585,1024],'errors':0}};s['reviewHistory'].append(review);save(A/'review.json',review)
g=b['head']['geometry'];removed=[r for r in g['relief'] if abs(r['center'][0])<=.10 and -.26<r['center'][1]<.1];g['relief']=[r for r in g['relief'] if r not in removed]
# C1-style broad support, weaker than C1 tip; no negative subnasal notch or full-width cavity.
added=[{'center':[0,-.020],'radius':[.043,.135],'depth':.042},{'center':[0,-.132],'radius':[.066,.086],'depth':.041},{'center':[0,-.213],'radius':[.095,.070],'depth':.012}]
for sign in [-1,1]:added.append({'center':[sign*.060,-.153],'radius':[.052,.063],'depth':.011})
g['relief']+=added
b['head']['optimization']['lastChange']='R5 C3 nose-only: remove C2 steep alar/subnasal field, broad gentle positive blend; C1-inspired fallback'
s['round5Correction3']={'scope':'nose relief only; no hair/body/camera/material/eye/lip edits','visualAcceptance':False,'baseline':'C1 softer profile principle; exact C2 nasal lobes removed, remaining C2 recipe unchanged'}
save(M/'spec.json',s);save(D/'changes.json',{'round':5,'correction':3,'authoredPartIDs':['head'],'changedPartIDs':['head'],'newPartIDs':[],'removedPartIDs':[],'retained':'C2 head rings/sampling, cheek/orbit, brows, eye/lip size and surface layers, all hair/body/materials','removedNasalRelief':removed,'addedNasalRelief':added})
