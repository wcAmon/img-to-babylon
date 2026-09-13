import { ArcRotateCamera, Vector3 } from '@babylonjs/core';
import type { BuiltModel } from '../types';
import type { SculptSpec } from './types';
import { SculptInspection } from './inspection';

export function installSculptInspector(model: BuiltModel, camera: ArcRotateCamera) {
  const spec = model.root.metadata?.sculptSpec as SculptSpec | undefined;
  if (!spec) return;
  const state = new SculptInspection(model, spec);
  const panel = document.createElement('section');
  panel.className = 'sculpt-panel';
  panel.setAttribute('aria-label', '模型零件檢查');
  const title = document.createElement('h2'); title.textContent = '女性戰術角色'; panel.append(title);
  const subtitle = document.createElement('p'); subtitle.textContent = `${spec.targetName} · ${spec.buildStage} · r${String(model.root.metadata?.iteration?.revision ?? 1).padStart(3,'0')}`; panel.append(subtitle);
  const stats = document.createElement('p'); const metrics = state.metrics();
  stats.textContent = `${metrics.components} 零件 · ${metrics.triangles.toLocaleString()} 三角面`; panel.append(stats);
  if (model.root.metadata?.iteration?.status === 'visual-review-required') {
    const status=document.createElement('p'); status.textContent='初版可操作 · 外觀仍待修正'; panel.append(status);
  }
  const row = document.createElement('div'); row.className = 'sculpt-actions'; panel.append(row);
  const button = (label: string, action: () => void, parent: HTMLElement = row) => {
    const b = document.createElement('button'); b.textContent = label; b.onclick = action; parent.append(b); return b;
  };
  const setView = (alpha: number, target = .9, radius = 2.65) => {
    camera.setTarget(new Vector3(0, target, 0).scale(model.physicsScale));
    camera.alpha = alpha; camera.beta = 1.48; camera.radius = radius * model.physicsScale;
  };
  button('正面', () => setView(Math.PI / 2)); button('三分之四', () => setView(1.22));
  button('背面', () => setView(-Math.PI / 2)); button('臉部', () => setView(1.4, 1.595, .60));
  const label = document.createElement('label'); label.textContent = '查看零件'; panel.append(label);
  const select = document.createElement('select'); select.setAttribute('aria-label', '查看零件'); panel.append(select);
  const option = (value: string, name: string) => { const o = document.createElement('option'); o.value = value; o.textContent = name; select.append(o); };
  option('', '完整角色');
  const groups: Record<string, string> = { face:'頭臉', hair:'髮型', torso:'上衣', equipment:'戰術裝備', arms:'手臂', hands:'手套與手指', legs:'褲子', boots:'靴子' };
  for (const [id, name] of Object.entries(groups)) option(id, `整組：${name}`);
  for (const c of spec.componentTree) option(c.id, c.name);
  const detail = document.createElement('p'); detail.className = 'sculpt-detail'; panel.append(detail);
  select.onchange = () => {
    state.isolate(select.value);
    const c = spec.componentTree.find(c => c.id === select.value);
    detail.textContent = c ? `${c.id} · ${c.geometry.kind} · ${Math.round(c.dimensions.w*1000)} × ${Math.round(c.dimensions.h*1000)} × ${Math.round(c.dimensions.d*1000)} mm` : groups[select.value] ?? '拖曳旋轉，滾輪縮放。';
  };
  const explodeLabel = document.createElement('label'); explodeLabel.textContent = '零件展開'; panel.append(explodeLabel);
  const slider = document.createElement('input'); slider.type = 'range'; slider.min='0'; slider.max='1'; slider.step='.05'; slider.value='0'; slider.setAttribute('aria-label','零件展開');
  slider.disabled = !!metrics.bodies;
  slider.oninput = () => {
    const amount=Number(slider.value); state.explode(amount);
    setView(1.22,.9+amount*.12,2.65+amount*.85);
  }; panel.append(slider);
  button('還原檢視', () => { state.reset(); select.value=''; slider.value='0'; detail.textContent='拖曳旋轉，滾輪縮放。'; setView(1.22); }, panel);
  button(metrics.bodies ? '返回造型檢視' : '開啟物理測試', () => {
    const p = new URLSearchParams(location.hash.slice(1)); p.set('physics', metrics.bodies ? '0' : '1'); p.delete('shot');
    location.hash=p.toString(); location.reload();
  }, panel);
  const note = document.createElement('p');
  note.textContent = metrics.bodies ? '整體剛體碰撞測試；展開檢視暫停使用。' : '造型檢視 · 尚未綁定動畫關節'; panel.append(note);
  const roadmap = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent='下一步優化'; roadmap.append(summary);
  for (const task of model.root.metadata?.iteration?.optimizationPath ?? []) {
    const p=document.createElement('p'); p.textContent=`${task.priority} · ${task.title}`; roadmap.append(p);
  }
  panel.append(roadmap); document.body.append(panel);
  if (!metrics.bodies) {
    const bar=document.querySelector('.harness-bar') as HTMLElement | null;
    if(bar) bar.style.display='none';
  }
  const css=document.createElement('style'); css.textContent=`.sculpt-panel{position:fixed;right:18px;top:18px;width:240px;padding:18px;border:1px solid #ffffff66;border-radius:16px;background:#f8faf9ee;color:#253244;font:13px/1.5 system-ui;max-height:calc(100vh - 74px);overflow:auto;box-shadow:0 12px 40px #21304618}.sculpt-panel h2{font-size:19px;margin:0}.sculpt-panel p{margin:8px 0;color:#526174}.sculpt-actions{display:flex;flex-wrap:wrap;gap:5px}.sculpt-panel button{border:1px solid #d0d8df;border-radius:7px;background:white;padding:6px 9px;color:#253244;cursor:pointer;margin:3px 0}.sculpt-panel label{display:block;margin-top:12px;font-weight:600}.sculpt-panel select,.sculpt-panel input{width:100%;box-sizing:border-box;margin-top:5px}.sculpt-panel select{padding:7px;border:1px solid #ccd7dd;border-radius:7px}.sculpt-detail{overflow-wrap:anywhere}.sculpt-panel summary{cursor:pointer}@media(max-width:760px){.sculpt-panel{top:auto;bottom:10px;right:10px;width:200px;max-height:30vh;font-size:11px;padding:10px}.sculpt-panel h2{font-size:14px}}`; document.head.append(css);
  const view = new URLSearchParams(location.hash.slice(1)).get('view');
  if (view === 'rear') setView(-Math.PI/2); else if (view === 'face') setView(1.4,1.595,.6); else if (view === 'front') setView(Math.PI/2);
}
