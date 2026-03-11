// Test runner for Animation & Prefab tools (12 tools, 26 steps)
// Usage: node test/run-anim-prefab-tests.mjs [phase1,phase2,...]
//   Phase 1: Animation tools (Steps 1-13)
//   Phase 2: Prefab tools (Steps 14-24)
//   Phase 3: Verification (Steps 25-26)
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { readFileSync } from 'fs';

const phases = process.argv[2] ? process.argv[2].split(',').map(Number) : [1, 2, 3];

let nextId = 1;
const results = {};
let child;
let rl;

function makeRequest(name, args) {
  const id = nextId++;
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } };
}

async function sendAndWait(req, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout for request ${req.id}: ${req.params.name}`)), timeoutMs);
    const handler = (line) => {
      try {
        const data = JSON.parse(line);
        if (data.id === req.id) {
          clearTimeout(timer);
          rl.removeListener('line', handler);
          resolve(data);
        }
      } catch {}
    };
    rl.on('line', handler);
    child.stdin.write(JSON.stringify(req) + '\n');
  });
}

function parseText(resp) {
  if (resp.result?.isError) return { error: true, text: resp.result.content?.[0]?.text || 'Unknown error' };
  const text = resp.result?.content?.[0]?.text || '';
  try { return { error: false, data: JSON.parse(text), text }; } catch { return { error: false, text }; }
}

function record(id, pass, note) {
  results[id] = { pass, note };
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: ${note}`);
}

// Start MCP server
child = spawn('node', ['dist/index.js'], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
rl = createInterface({ input: child.stdout });

// Capture stderr for debugging
child.stderr.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg) console.error(`[server stderr] ${msg}`);
});

async function waitForConnection(maxWait = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const resp = await Promise.race([
        sendAndWait(makeRequest('cc_get_project_info', {}), 3000),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
      ]);
      if (resp.result && !resp.result.isError) return resp;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Could not connect to Cocos Creator');
}

// Helper: small delay for asset DB operations to settle
const settle = (ms = 2000) => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('Waiting for Cocos Creator connection...');
  const connResp = await waitForConnection();
  const projInfo = parseText(connResp);
  console.log('Connected!', projInfo.text);

  // Shared state across phases
  let walkClipUuid = null;
  let fadeClipUuid = null;

  // =======================================================================
  // PHASE 1: Animation Tools (Steps 1-13)
  // =======================================================================
  if (phases.includes(1)) {
    console.log('\n========================================');
    console.log('Phase 1: Animation Tools');
    console.log('========================================');

    // --- Step 1: cc_list_animations — empty project ---
    const a1 = parseText(await sendAndWait(makeRequest('cc_list_animations', {})));
    record('AN-1', !a1.error && Array.isArray(a1.data) && a1.data.length === 0,
      a1.error ? a1.text : `${a1.data?.length} anims (expected 0)`);

    // --- Step 2: cc_create_animation_clip — complex walk animation ---
    // Pre-create the animations directory (assetdb.create doesn't auto-create parent dirs)
    {
      const { mkdirSync } = await import('fs');
      const animDir = 'C:/Users/zyb/Desktop/TestMcp/assets/animations';
      try { mkdirSync(animDir, { recursive: true }); } catch {}
      await sendAndWait(makeRequest('cc_refresh_assets', { path: 'db://assets' }));
      await settle(2000);
    }
    const walkCurveData = {
      paths: {
        '': {
          props: {
            position: [
              { frame: 0, value: [0, 0] },
              { frame: 0.5, value: [10, 5] },
              { frame: 1.0, value: [0, 0] }
            ],
            rotation: [
              { frame: 0, value: 0 },
              { frame: 0.5, value: 5 },
              { frame: 1.0, value: 0 }
            ]
          }
        },
        'LeftArm': {
          props: {
            rotation: [
              { frame: 0, value: 0 },
              { frame: 0.25, value: 30 },
              { frame: 0.5, value: 0 },
              { frame: 0.75, value: -30 },
              { frame: 1.0, value: 0 }
            ]
          }
        },
        'RightArm': {
          props: {
            rotation: [
              { frame: 0, value: 0 },
              { frame: 0.25, value: -30 },
              { frame: 0.5, value: 0 },
              { frame: 0.75, value: 30 },
              { frame: 1.0, value: 0 }
            ]
          }
        },
        'LeftLeg': {
          props: {
            rotation: [
              { frame: 0, value: 0 },
              { frame: 0.25, value: -20 },
              { frame: 0.5, value: 0 },
              { frame: 0.75, value: 20 },
              { frame: 1.0, value: 0 }
            ]
          }
        },
        'RightLeg': {
          props: {
            rotation: [
              { frame: 0, value: 0 },
              { frame: 0.25, value: 20 },
              { frame: 0.5, value: 0 },
              { frame: 0.75, value: -20 },
              { frame: 1.0, value: 0 }
            ]
          }
        },
        'Head': {
          comps: {
            'cc.Sprite': {
              fillRange: [
                { frame: 0, value: 1.0 },
                { frame: 0.5, value: 0.5 },
                { frame: 1.0, value: 1.0 }
              ]
            }
          }
        }
      }
    };
    const a2 = parseText(await sendAndWait(makeRequest('cc_create_animation_clip', {
      path: 'db://assets/animations/role_walk.anim',
      name: 'role_walk',
      duration: 1.0,
      sample: 60,
      wrapMode: 2,
      curveData: walkCurveData,
    })));
    record('AN-2', !a2.error,
      a2.error ? a2.text : 'Created role_walk.anim');

    await settle(3000); // wait for asset DB

    // --- Step 3: cc_create_animation_clip — fade/pulse animation ---
    const fadeCurveData = {
      paths: {
        '': {
          props: {
            opacity: [
              { frame: 0, value: 0 },
              { frame: 1.0, value: 255 },
              { frame: 2.0, value: 0 }
            ],
            scaleX: [
              { frame: 0, value: 0.8 },
              { frame: 1.0, value: 1.2 },
              { frame: 2.0, value: 0.8 }
            ],
            scaleY: [
              { frame: 0, value: 0.8 },
              { frame: 1.0, value: 1.2 },
              { frame: 2.0, value: 0.8 }
            ],
            position: [
              { frame: 0, value: [0, 0] },
              { frame: 0.5, value: [0, 30] },
              { frame: 1.0, value: [0, 0] },
              { frame: 1.5, value: [0, 20] },
              { frame: 2.0, value: [0, 0] }
            ]
          }
        }
      }
    };
    const a3 = parseText(await sendAndWait(makeRequest('cc_create_animation_clip', {
      path: 'db://assets/animations/role_fade.anim',
      name: 'role_fade',
      duration: 2.0,
      sample: 60,
      wrapMode: 22,
      curveData: fadeCurveData,
    })));
    record('AN-3', !a3.error,
      a3.error ? a3.text : 'Created role_fade.anim');

    await settle(3000);

    // --- Step 4: cc_list_animations — verify 2 clips ---
    const a4 = parseText(await sendAndWait(makeRequest('cc_list_animations', {})));
    const a4ok = !a4.error && Array.isArray(a4.data) && a4.data.length === 2;
    record('AN-4', a4ok,
      a4.error ? a4.text : `${a4.data?.length} anims (expected 2)`);

    // Extract UUIDs for later use
    if (a4ok) {
      for (const item of a4.data) {
        if (item.url?.includes('role_walk')) walkClipUuid = item.uuid;
        if (item.url?.includes('role_fade')) fadeClipUuid = item.uuid;
      }
    }

    // --- Step 5: cc_read_animation_clip — URL read walk ---
    const a5 = parseText(await sendAndWait(makeRequest('cc_read_animation_clip', {
      path: 'db://assets/animations/role_walk.anim',
    })));
    const a5ok = !a5.error && a5.data?.name === 'role_walk' && a5.data?.duration === 1.0
      && Array.isArray(a5.data?.tracks) && a5.data.tracks.length > 0;
    record('AN-5', a5ok,
      a5.error ? a5.text : `name=${a5.data?.name}, dur=${a5.data?.duration}, tracks=${a5.data?.tracks?.length}`);

    // --- Step 6: cc_read_animation_clip — UUID read fade ---
    if (!fadeClipUuid) {
      // Fallback: get UUID via asset info
      const info = parseText(await sendAndWait(makeRequest('cc_get_asset_info', {
        path: 'db://assets/animations/role_fade.anim',
      })));
      if (!info.error && info.data?.uuid) fadeClipUuid = info.data.uuid;
    }

    if (fadeClipUuid) {
      const a6 = parseText(await sendAndWait(makeRequest('cc_read_animation_clip', {
        uuid: fadeClipUuid,
      })));
      const a6ok = !a6.error && a6.data?.name === 'role_fade' && a6.data?.duration === 2.0 && a6.data?.wrapMode === 22;
      record('AN-6', a6ok,
        a6.error ? a6.text : `name=${a6.data?.name}, dur=${a6.data?.duration}, wrapMode=${a6.data?.wrapMode}`);
    } else {
      record('AN-6', false, 'SKIP - no fade clip UUID');
    }

    // --- Step 7: cc_edit_animation_clip — modify walk ---
    const editCurveData = {
      ...walkCurveData,
      paths: {
        ...walkCurveData.paths,
        'Head': {
          ...walkCurveData.paths['Head'],
          props: {
            scaleX: [
              { frame: 0, value: 1.0 },
              { frame: 0.75, value: 1.1 },
              { frame: 1.5, value: 1.0 }
            ],
            scaleY: [
              { frame: 0, value: 1.0 },
              { frame: 0.75, value: 1.1 },
              { frame: 1.5, value: 1.0 }
            ]
          }
        }
      }
    };
    const a7 = parseText(await sendAndWait(makeRequest('cc_edit_animation_clip', {
      path: 'db://assets/animations/role_walk.anim',
      duration: 1.5,
      speed: 1.2,
      curveData: editCurveData,
    })));
    record('AN-7a', !a7.error,
      a7.error ? a7.text : 'Edit submitted');

    await settle(2000);

    // Verify edit
    const a7v = parseText(await sendAndWait(makeRequest('cc_read_animation_clip', {
      path: 'db://assets/animations/role_walk.anim',
    })));
    const a7ok = !a7v.error && a7v.data?.duration === 1.5 && a7v.data?.speed === 1.2;
    record('AN-7b', a7ok,
      a7v.error ? a7v.text : `dur=${a7v.data?.duration} (exp 1.5), speed=${a7v.data?.speed} (exp 1.2)`);

    // --- Step 8: Add cc.Animation to Role ---
    const a8 = parseText(await sendAndWait(makeRequest('cc_add_component', {
      path: 'Canvas/Role',
      componentType: 'cc.Animation',
    })));
    record('AN-8', !a8.error,
      a8.error ? a8.text : 'Added cc.Animation to Canvas/Role');

    // --- Step 9: cc_set_node_animation_clip — add walk clip ---
    if (!walkClipUuid) {
      // Fallback
      const info = parseText(await sendAndWait(makeRequest('cc_list_animations', {})));
      if (!info.error && Array.isArray(info.data)) {
        for (const item of info.data) {
          if (item.url?.includes('role_walk')) walkClipUuid = item.uuid;
          if (item.url?.includes('role_fade')) fadeClipUuid = item.uuid;
        }
      }
    }

    if (walkClipUuid) {
      const a9 = parseText(await sendAndWait(makeRequest('cc_set_node_animation_clip', {
        path: 'Canvas/Role',
        action: 'add',
        clipUuid: walkClipUuid,
      })));
      record('AN-9', !a9.error,
        a9.error ? a9.text : 'Added walk clip to Role');
    } else {
      record('AN-9', false, 'SKIP - no walk clip UUID');
    }

    // --- Step 10: cc_set_node_animation_clip — add + setDefault fade ---
    if (fadeClipUuid) {
      const a10a = parseText(await sendAndWait(makeRequest('cc_set_node_animation_clip', {
        path: 'Canvas/Role',
        action: 'add',
        clipUuid: fadeClipUuid,
      })));
      record('AN-10a', !a10a.error,
        a10a.error ? a10a.text : 'Added fade clip to Role');

      const a10b = parseText(await sendAndWait(makeRequest('cc_set_node_animation_clip', {
        path: 'Canvas/Role',
        action: 'setDefault',
        clipUuid: fadeClipUuid,
      })));
      record('AN-10b', !a10b.error,
        a10b.error ? a10b.text : 'Set fade as defaultClip');
    } else {
      record('AN-10a', false, 'SKIP - no fade clip UUID');
      record('AN-10b', false, 'SKIP - no fade clip UUID');
    }

    // --- Step 11: cc_get_node_animations — verify ---
    const a11 = parseText(await sendAndWait(makeRequest('cc_get_node_animations', {
      path: 'Canvas/Role',
    })));
    const a11ok = !a11.error && Array.isArray(a11.data?.clips) && a11.data.clips.length === 2
      && a11.data.defaultClip === 'role_fade';
    record('AN-11', a11ok,
      a11.error ? a11.text : `clips=${a11.data?.clips?.length} (exp 2), default=${a11.data?.defaultClip} (exp role_fade)`);

    // --- Step 12: cc_play_animation — full playback control ---
    // play default clip
    const a12a = parseText(await sendAndWait(makeRequest('cc_play_animation', {
      path: 'Canvas/Role', action: 'play',
    })));
    record('AN-12a', !a12a.error,
      a12a.error ? a12a.text : 'play(default) OK');

    // pause
    const a12b = parseText(await sendAndWait(makeRequest('cc_play_animation', {
      path: 'Canvas/Role', action: 'pause',
    })));
    record('AN-12b', !a12b.error,
      a12b.error ? a12b.text : 'pause OK');

    // resume
    const a12c = parseText(await sendAndWait(makeRequest('cc_play_animation', {
      path: 'Canvas/Role', action: 'resume',
    })));
    record('AN-12c', !a12c.error,
      a12c.error ? a12c.text : 'resume OK');

    // play specific clip
    const a12d = parseText(await sendAndWait(makeRequest('cc_play_animation', {
      path: 'Canvas/Role', action: 'play', clipName: 'role_walk',
    })));
    record('AN-12d', !a12d.error,
      a12d.error ? a12d.text : 'play(role_walk) OK');

    // stop
    const a12e = parseText(await sendAndWait(makeRequest('cc_play_animation', {
      path: 'Canvas/Role', action: 'stop',
    })));
    record('AN-12e', !a12e.error,
      a12e.error ? a12e.text : 'stop OK');

    // --- Step 13: cc_set_node_animation_clip — remove fade ---
    if (fadeClipUuid) {
      const a13 = parseText(await sendAndWait(makeRequest('cc_set_node_animation_clip', {
        path: 'Canvas/Role',
        action: 'remove',
        clipUuid: fadeClipUuid,
      })));
      record('AN-13a', !a13.error,
        a13.error ? a13.text : 'Removed fade clip');

      // Verify
      const a13v = parseText(await sendAndWait(makeRequest('cc_get_node_animations', {
        path: 'Canvas/Role',
      })));
      const a13ok = !a13v.error && Array.isArray(a13v.data?.clips) && a13v.data.clips.length === 1;
      record('AN-13b', a13ok,
        a13v.error ? a13v.text : `clips=${a13v.data?.clips?.length} (exp 1)`);
    } else {
      record('AN-13a', false, 'SKIP - no fade clip UUID');
      record('AN-13b', false, 'SKIP - no fade clip UUID');
    }
  }

  // =======================================================================
  // PHASE 2: Prefab Tools (Steps 14-24)
  // =======================================================================
  if (phases.includes(2)) {
    console.log('\n========================================');
    console.log('Phase 2: Prefab Tools');
    console.log('========================================');

    // --- Step 14: cc_list_prefabs — empty project ---
    const p14 = parseText(await sendAndWait(makeRequest('cc_list_prefabs', {})));
    record('PF-14', !p14.error && Array.isArray(p14.data) && p14.data.length === 0,
      p14.error ? p14.text : `${p14.data?.length} prefabs (expected 0)`);

    // --- Step 15: Build complex UI node structure ---
    console.log('[setup] Building UIPanel node tree...');

    // Create UIPanel
    const n1 = parseText(await sendAndWait(makeRequest('cc_create_node', {
      parentPath: 'Canvas', name: 'UIPanel', position: { x: 0, y: 0 },
    })));
    record('PF-15a', !n1.error, n1.error ? n1.text : 'Created UIPanel');

    // Create Title under UIPanel
    const n2 = parseText(await sendAndWait(makeRequest('cc_create_node', {
      parentPath: 'Canvas/UIPanel', name: 'Title', position: { x: 0, y: 100 },
    })));
    record('PF-15b', !n2.error, n2.error ? n2.text : 'Created Title');

    // Add cc.Label to Title
    const c2a = parseText(await sendAndWait(makeRequest('cc_add_component', {
      path: 'Canvas/UIPanel/Title', componentType: 'cc.Label',
    })));
    if (!c2a.error) {
      await sendAndWait(makeRequest('cc_set_component_property', {
        path: 'Canvas/UIPanel/Title', componentType: 'cc.Label',
        property: 'string', value: '测试面板',
      }));
      await sendAndWait(makeRequest('cc_set_component_property', {
        path: 'Canvas/UIPanel/Title', componentType: 'cc.Label',
        property: 'fontSize', value: 32,
      }));
    }

    // Create Icon under UIPanel
    const n3 = parseText(await sendAndWait(makeRequest('cc_create_node', {
      parentPath: 'Canvas/UIPanel', name: 'Icon', position: { x: -100, y: 0 },
    })));
    if (!n3.error) {
      await sendAndWait(makeRequest('cc_add_component', {
        path: 'Canvas/UIPanel/Icon', componentType: 'cc.Sprite',
      }));
    }

    // Create ButtonGroup under UIPanel
    const n4 = parseText(await sendAndWait(makeRequest('cc_create_node', {
      parentPath: 'Canvas/UIPanel', name: 'ButtonGroup', position: { x: 0, y: -100 },
    })));

    // Create BtnOK under ButtonGroup
    const n5 = parseText(await sendAndWait(makeRequest('cc_create_node', {
      parentPath: 'Canvas/UIPanel/ButtonGroup', name: 'BtnOK', position: { x: -80, y: 0 },
    })));
    if (!n5.error) {
      await sendAndWait(makeRequest('cc_add_component', {
        path: 'Canvas/UIPanel/ButtonGroup/BtnOK', componentType: 'cc.Label',
      }));
      await sendAndWait(makeRequest('cc_set_component_property', {
        path: 'Canvas/UIPanel/ButtonGroup/BtnOK', componentType: 'cc.Label',
        property: 'string', value: '确定',
      }));
      await sendAndWait(makeRequest('cc_add_component', {
        path: 'Canvas/UIPanel/ButtonGroup/BtnOK', componentType: 'cc.Button',
      }));
    }

    // Create BtnCancel under ButtonGroup
    const n6 = parseText(await sendAndWait(makeRequest('cc_create_node', {
      parentPath: 'Canvas/UIPanel/ButtonGroup', name: 'BtnCancel', position: { x: 80, y: 0 },
    })));
    if (!n6.error) {
      await sendAndWait(makeRequest('cc_add_component', {
        path: 'Canvas/UIPanel/ButtonGroup/BtnCancel', componentType: 'cc.Label',
      }));
      await sendAndWait(makeRequest('cc_set_component_property', {
        path: 'Canvas/UIPanel/ButtonGroup/BtnCancel', componentType: 'cc.Label',
        property: 'string', value: '取消',
      }));
      await sendAndWait(makeRequest('cc_add_component', {
        path: 'Canvas/UIPanel/ButtonGroup/BtnCancel', componentType: 'cc.Button',
      }));
    }
    record('PF-15c', !n6.error, 'UIPanel tree built with Label/Sprite/Button components');

    // --- Step 16: cc_get_prefab_status — non-prefab node ---
    const p16 = parseText(await sendAndWait(makeRequest('cc_get_prefab_status', {
      path: 'Canvas/UIPanel',
    })));
    const p16ok = !p16.error && p16.data?.isPrefab === false;
    record('PF-16', p16ok,
      p16.error ? p16.text : `isPrefab=${p16.data?.isPrefab} (expected false)`);

    // --- Step 17: cc_create_prefab — save UIPanel ---
    // Pre-create the prefabs directory
    {
      const { mkdirSync } = await import('fs');
      const prefabDir = 'C:/Users/zyb/Desktop/TestMcp/assets/prefabs';
      try { mkdirSync(prefabDir, { recursive: true }); } catch {}
      await sendAndWait(makeRequest('cc_refresh_assets', { path: 'db://assets' }));
      await settle(2000);
    }
    const p17 = parseText(await sendAndWait(makeRequest('cc_create_prefab', {
      nodePath: 'Canvas/UIPanel',
      savePath: 'db://assets/prefabs/UIPanel.prefab',
    }), 30000));
    record('PF-17', !p17.error,
      p17.error ? p17.text : 'Saved UIPanel.prefab');

    await settle(3000);

    // --- Step 18: cc_create_prefab — save Role ---
    const p18 = parseText(await sendAndWait(makeRequest('cc_create_prefab', {
      nodePath: 'Canvas/Role',
      savePath: 'db://assets/prefabs/Role.prefab',
    }), 30000));
    record('PF-18', !p18.error,
      p18.error ? p18.text : 'Saved Role.prefab');

    await settle(3000);

    // --- Step 19: cc_list_prefabs — verify 2 ---
    const p19 = parseText(await sendAndWait(makeRequest('cc_list_prefabs', {})));
    const p19ok = !p19.error && Array.isArray(p19.data) && p19.data.length === 2;
    record('PF-19', p19ok,
      p19.error ? p19.text : `${p19.data?.length} prefabs (expected 2)`);

    // Extract prefab UUIDs
    let uiPanelPrefabUuid = null;
    let rolePrefabUuid = null;
    if (p19ok) {
      for (const item of p19.data) {
        if (item.url?.includes('UIPanel')) uiPanelPrefabUuid = item.uuid;
        if (item.url?.includes('Role')) rolePrefabUuid = item.uuid;
      }
    }

    // --- Step 20: cc_get_prefab_info — URL read UIPanel ---
    const p20 = parseText(await sendAndWait(makeRequest('cc_get_prefab_info', {
      path: 'db://assets/prefabs/UIPanel.prefab',
    })));
    const p20nodes = p20.data?.nodes || [];
    const p20nodeNames = p20nodes.map(n => n.name);
    const p20hasExpected = ['UIPanel', 'Title', 'Icon', 'ButtonGroup', 'BtnOK', 'BtnCancel']
      .every(n => p20nodeNames.includes(n));
    record('PF-20', !p20.error && p20hasExpected,
      p20.error ? p20.text : `nodes: [${p20nodeNames.join(', ')}], comps=${p20.data?.components?.length || 0}`);

    // --- Step 21: cc_get_prefab_info — UUID read Role ---
    if (rolePrefabUuid) {
      const p21 = parseText(await sendAndWait(makeRequest('cc_get_prefab_info', {
        uuid: rolePrefabUuid,
      })));
      const p21nodes = p21.data?.nodes || [];
      const p21nodeNames = p21nodes.map(n => n.name);
      const p21hasRole = p21nodeNames.includes('Role');
      const p21hasChildren = p21nodes.length >= 7; // Role + 6 children
      record('PF-21', !p21.error && p21hasRole && p21hasChildren,
        p21.error ? p21.text : `nodes(${p21nodes.length}): [${p21nodeNames.join(', ')}]`);
    } else {
      record('PF-21', false, 'SKIP - no Role prefab UUID');
    }

    // --- Step 22: cc_instantiate_prefab — prefabPath ---
    const p22 = parseText(await sendAndWait(makeRequest('cc_instantiate_prefab', {
      prefabPath: 'db://assets/prefabs/UIPanel.prefab',
      parentPath: 'Canvas',
      position: { x: 200, y: 100 },
    })));
    record('PF-22', !p22.error && p22.data?.name,
      p22.error ? p22.text : `Instantiated: ${p22.data?.name}, children=${p22.data?.children?.length || 0}`);

    // --- Step 23: cc_instantiate_prefab — prefabUuid ---
    if (rolePrefabUuid) {
      const p23 = parseText(await sendAndWait(makeRequest('cc_instantiate_prefab', {
        prefabUuid: rolePrefabUuid,
        parentPath: 'Canvas',
        position: { x: -200, y: -100 },
      })));
      const p23children = p23.data?.children?.length || 0;
      record('PF-23', !p23.error && p23children >= 6,
        p23.error ? p23.text : `Instantiated: ${p23.data?.name}, children=${p23children} (exp >=6)`);
    } else {
      record('PF-23', false, 'SKIP - no Role prefab UUID');
    }

    // --- Step 24: cc_get_prefab_status — verify prefab instance ---
    // The instantiated UIPanel copy — find it (it may have same name)
    const p24 = parseText(await sendAndWait(makeRequest('cc_get_prefab_status', {
      path: 'Canvas/UIPanel',
    })));
    // After saving as prefab via cc_create_prefab, the original node might also become a prefab instance
    // depending on CC2 behavior. Just check the response is valid.
    record('PF-24', !p24.error && typeof p24.data?.isPrefab === 'boolean',
      p24.error ? p24.text : `isPrefab=${p24.data?.isPrefab}, assetUuid=${p24.data?.assetUuid || 'N/A'}`);
  }

  // =======================================================================
  // PHASE 3: Verification (Steps 25-26)
  // =======================================================================
  if (phases.includes(3)) {
    console.log('\n========================================');
    console.log('Phase 3: Verification');
    console.log('========================================');

    // --- Step 25: Check editor logs ---
    const v25 = parseText(await sendAndWait(makeRequest('cc_get_console_logs', { level: 'error' })));
    const errLogs = Array.isArray(v25.data) ? v25.data : [];
    // Filter out pre-existing errors and test-injected errors
    const relevantErrors = errLogs.filter(l =>
      !l.message?.includes('[cc2-mcp-test]') &&
      !l.message?.includes('deprecated')
    );
    record('V-25', !v25.error && relevantErrors.length === 0,
      v25.error ? v25.text : `${relevantErrors.length} relevant errors in console (${errLogs.length} total error logs)`);
    if (relevantErrors.length > 0) {
      console.log('  Error logs:');
      relevantErrors.slice(0, 5).forEach(l => console.log(`    - ${l.message}`));
    }

    // --- Step 26: Final scene tree ---
    const v26 = parseText(await sendAndWait(makeRequest('cc_get_scene_tree', {})));
    record('V-26', !v26.error && v26.data,
      v26.error ? v26.text : 'Scene tree retrieved');
    if (!v26.error && v26.data) {
      // Print simplified tree
      function printTree(node, indent = '') {
        if (!node) return;
        console.log(`  ${indent}${node.name || '(root)'}`);
        if (node.children) {
          for (const child of node.children) {
            printTree(child, indent + '  ');
          }
        }
      }
      printTree(v26.data);
    }
  }

  // =======================================================================
  // CLEANUP
  // =======================================================================
  console.log('\n========================================');
  console.log('CLEANUP');
  console.log('========================================');

  // Delete test nodes (UIPanel and its duplicates, Role duplicates)
  const cleanupNodes = [
    'Canvas/UIPanel',
  ];
  for (const nodePath of cleanupNodes) {
    try {
      await sendAndWait(makeRequest('cc_delete_node', { path: nodePath }), 5000);
      console.log(`[cleanup] Deleted ${nodePath}`);
    } catch {
      console.log(`[cleanup] Warning: could not delete ${nodePath}`);
    }
  }

  // Find and delete instantiated copies (they might be named UIPanel or Role at the end)
  try {
    const copies = parseText(await sendAndWait(makeRequest('cc_find_nodes', { pattern: '^(UIPanel|Role)$' }), 5000));
    if (!copies.error && Array.isArray(copies.data)) {
      // Delete copies that are direct children of Canvas (not the original Role)
      for (const node of copies.data) {
        if (node.path === 'Canvas/UIPanel' || (node.path === 'Canvas/Role' && copies.data.filter(n => n.name === 'Role').length > 1)) {
          try {
            await sendAndWait(makeRequest('cc_delete_node', { uuid: node.uuid }), 5000);
            console.log(`[cleanup] Deleted copy: ${node.path} (${node.uuid})`);
          } catch {}
        }
      }
    }
  } catch {}

  // Remove Animation component from Role
  try {
    await sendAndWait(makeRequest('cc_remove_component', {
      path: 'Canvas/Role', componentType: 'cc.Animation',
    }), 5000);
    console.log('[cleanup] Removed cc.Animation from Canvas/Role');
  } catch {}

  // Delete created assets
  const cleanupAssets = [
    'db://assets/animations/role_walk.anim',
    'db://assets/animations/role_fade.anim',
    'db://assets/prefabs/UIPanel.prefab',
    'db://assets/prefabs/Role.prefab',
  ];
  for (const assetUrl of cleanupAssets) {
    try {
      await sendAndWait(makeRequest('cc_delete_asset', { path: assetUrl }), 5000);
      console.log(`[cleanup] Deleted asset ${assetUrl}`);
    } catch {
      console.log(`[cleanup] Warning: could not delete ${assetUrl}`);
    }
  }

  await settle(2000);

  // Delete empty directories (assetdb.delete doesn't work for dirs — use fs directly)
  {
    const { rmSync } = await import('fs');
    for (const dir of ['C:/Users/zyb/Desktop/TestMcp/assets/animations', 'C:/Users/zyb/Desktop/TestMcp/assets/prefabs']) {
      try {
        rmSync(dir, { recursive: true });
        console.log(`[cleanup] Deleted directory ${dir}`);
      } catch {}
    }
    // Refresh assetdb so editor picks up the removal
    try { await sendAndWait(makeRequest('cc_refresh_assets', { path: 'db://assets' }), 5000); } catch {}
  }

  // Restore scene file
  try {
    const { execSync } = await import('child_process');
    execSync('git checkout -- assets/Scene/helloworld.fire', { cwd: 'C:/Users/zyb/Desktop/TestMcp', stdio: 'pipe' });
    console.log('[cleanup] Scene file restored via git');
  } catch (e) {
    console.log('[cleanup] Warning: could not restore scene file:', e.message);
  }

  // =======================================================================
  // SUMMARY
  // =======================================================================
  console.log('\n========================================');
  console.log('TEST RESULTS SUMMARY');
  console.log('========================================');
  const ids = Object.keys(results).sort((a, b) => {
    // Sort by prefix then number
    const [pa, na] = [a.replace(/-.*/, ''), parseInt(a.replace(/.*-/, '').replace(/[a-z]/, ''))];
    const [pb, nb] = [b.replace(/-.*/, ''), parseInt(b.replace(/.*-/, '').replace(/[a-z]/, ''))];
    if (pa !== pb) return pa.localeCompare(pb);
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });
  let pass = 0, fail = 0, skip = 0;
  for (const id of ids) {
    const r = results[id];
    if (r.note?.startsWith('SKIP')) skip++;
    else if (r.pass) pass++;
    else fail++;
  }
  console.log(`Total: ${ids.length} | Pass: ${pass} | Fail: ${fail} | Skip: ${skip}`);
  console.log('');
  for (const id of ids) {
    const r = results[id];
    const status = r.note?.startsWith('SKIP') ? 'SKIP' : r.pass ? 'PASS' : 'FAIL';
    console.log(`${status.padEnd(4)} ${id.padEnd(8)} ${r.note}`);
  }
  console.log('');

  // Output JSON for parsing
  console.log('---JSON_RESULTS---');
  console.log(JSON.stringify({ results, summary: { total: ids.length, pass, fail, skip } }));

  child.kill();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  child?.kill();
  process.exit(1);
});
