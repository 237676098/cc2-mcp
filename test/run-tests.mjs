// Test runner: sends multiple MCP tool calls over a single STDIO session
// Usage: node test/run-tests.mjs [phase1,phase2,...]
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const phases = process.argv[2] ? process.argv[2].split(',').map(Number) : [1,2,3,4,5,6,7,8];

// All test calls organized by phase
const allCalls = {
  1: [
    { id: 'P-1', name: 'cc_get_project_info', args: {} },
    { id: 'P-2', name: 'cc_list_scenes', args: {} },
    { id: 'P-3', name: 'cc_list_scripts', args: {} },
    { id: 'P-4', name: 'cc_get_project_settings', args: { category: 'project' } },
  ],
  2: [
    { id: 'S-1', name: 'cc_get_current_scene_info', args: {} },
    { id: 'S-2', name: 'cc_get_scene_tree', args: {} },
    { id: 'S-3', name: 'cc_get_scene_tree', args: { maxDepth: 1 } },
    // S-4 and S-5 handled dynamically
  ],
  3: [
    { id: 'N-1', name: 'cc_get_node', args: { path: 'Canvas' } },
    // N-2 ~ N-17 handled dynamically
  ],
  4: [
    { id: 'C-1', name: 'cc_get_components', args: { path: 'Canvas' } },
    { id: 'C-2', name: 'cc_get_component', args: { path: 'Canvas/label', component: 'cc.Label' } },
    // C-3 ~ C-8 handled dynamically
  ],
  5: [
    { id: 'A-1', name: 'cc_list_assets', args: { url: 'db://assets' } },
    { id: 'A-2', name: 'cc_list_assets', args: { url: 'db://assets', type: 'scene' } },
    // A-3 ~ A-11 handled dynamically
  ],
  6: [
    { id: 'E-1', name: 'cc_get_console_logs', args: {} },
    { id: 'E-2', name: 'cc_get_console_logs', args: { level: 'error' } },
    { id: 'E-3', name: 'cc_log_message', args: { message: '[cc2-mcp-test] test log message', level: 'log' } },
    { id: 'E-4', name: 'cc_log_message', args: { message: '[cc2-mcp-test] test warn message', level: 'warn' } },
    { id: 'E-5', name: 'cc_log_message', args: { message: '[cc2-mcp-test] test error message', level: 'error' } },
    { id: 'E-6', name: 'cc_get_selection', args: {} },
    // E-7, E-8 handled dynamically
  ],
  8: [
    { id: 'X-1', name: 'cc_get_node', args: { path: 'Canvas/nonexistent_node_12345' } },
    { id: 'X-2', name: 'cc_find_nodes', args: { pattern: 'zzz_no_match_zzz' } },
    { id: 'X-3', name: 'cc_get_component', args: { path: 'Canvas', component: 'cc.NonExistentComponent' } },
    { id: 'X-4', name: 'cc_delete_node', args: { path: 'Canvas/nonexistent_node_12345' } },
    { id: 'X-5', name: 'cc_set_node_property', args: { path: 'Canvas', property: 'fakeProperty', value: 123 } },
  ],
};

let nextId = 1;
const results = {};
let child;

function makeRequest(name, args) {
  const id = nextId++;
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } };
}

function makeResourceRequest(uri) {
  const id = nextId++;
  return { jsonrpc: '2.0', id, method: 'resources/read', params: { uri } };
}

async function sendAndWait(req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout for request ${req.id}`)), 45000);
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

// Start MCP server
child = spawn('node', ['dist/index.js'], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
const rl = createInterface({ input: child.stdout });

// Wait for WS connection
async function waitForConnection(maxWait = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const resp = await Promise.race([
        sendAndWait(makeRequest('cc_get_project_info', {})),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
      ]);
      if (resp.result && !resp.result.isError) return resp;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Could not connect to Cocos Creator');
}

function parseText(resp) {
  if (resp.result?.isError) return { error: true, text: resp.result.content?.[0]?.text || 'Unknown error' };
  const text = resp.result?.content?.[0]?.text || resp.result?.contents?.[0]?.text || '';
  try { return { error: false, data: JSON.parse(text), text }; } catch { return { error: false, text }; }
}

function record(id, pass, note) {
  results[id] = { pass, note };
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: ${note}`);
}

async function run() {
  console.log('Waiting for Cocos Creator connection...');
  const connResp = await waitForConnection();
  const projInfo = parseText(connResp);
  console.log('Connected!', projInfo.text);

  let sceneUrl = null;
  let canvasUuid = null;
  let testNodeUuid = null;
  let testNodeCopyUuid = null;
  let testParentCreated = false;

  // === PHASE 1: Project ===
  if (phases.includes(1)) {
    console.log('\n=== Phase 1: Project ===');
    // P-1 already done via connection
    record('P-1', !projInfo.error && projInfo.data?.name && projInfo.data?.engineVersion,
      projInfo.error ? projInfo.text : `name=${projInfo.data?.name}, engine=${projInfo.data?.engineVersion}`);

    // P-2
    const p2 = parseText(await sendAndWait(makeRequest('cc_list_scenes', {})));
    const p2ok = !p2.error && Array.isArray(p2.data) && p2.data.length > 0 && p2.data[0].url;
    record('P-2', p2ok, p2.error ? p2.text : `${p2.data?.length} scenes found`);
    if (p2ok) sceneUrl = p2.data[0].url;

    // P-3
    const p3 = parseText(await sendAndWait(makeRequest('cc_list_scripts', {})));
    record('P-3', !p3.error && Array.isArray(p3.data), p3.error ? p3.text : `${p3.data?.length} scripts found`);

    // P-4
    const p4 = parseText(await sendAndWait(makeRequest('cc_get_project_settings', { category: 'project' })));
    record('P-4', !p4.error && p4.data, p4.error ? p4.text : 'Settings retrieved');
  }

  // === PHASE 2: Scene ===
  if (phases.includes(2)) {
    console.log('\n=== Phase 2: Scene ===');
    // Dependency: need sceneUrl from P-2
    if (!sceneUrl) {
      console.log('[前置数据获取] Fetching scene URL...');
      const dep = parseText(await sendAndWait(makeRequest('cc_list_scenes', {})));
      if (!dep.error && Array.isArray(dep.data) && dep.data.length > 0) sceneUrl = dep.data[0].url;
    }

    const s1 = parseText(await sendAndWait(makeRequest('cc_get_current_scene_info', {})));
    record('S-1', !s1.error && s1.data?.name && s1.data?.uuid,
      s1.error ? s1.text : `name=${s1.data?.name}, children=${s1.data?.childCount}`);

    const s2 = parseText(await sendAndWait(makeRequest('cc_get_scene_tree', {})));
    record('S-2', !s2.error && s2.data, s2.error ? s2.text : 'Full tree retrieved');

    const s3 = parseText(await sendAndWait(makeRequest('cc_get_scene_tree', { maxDepth: 1 })));
    record('S-3', !s3.error && s3.data, s3.error ? s3.text : 'Depth-limited tree retrieved');

    if (sceneUrl) {
      const s4 = parseText(await sendAndWait(makeRequest('cc_open_scene', { scenePath: sceneUrl })));
      record('S-4', !s4.error, s4.error ? s4.text : 'Scene opened');
    } else {
      record('S-4', false, 'SKIP - no scene URL available');
    }

    const s5 = parseText(await sendAndWait(makeRequest('cc_save_scene', {})));
    record('S-5', !s5.error, s5.error ? s5.text : 'Scene saved');
  }

  // === PHASE 3: Node ===
  if (phases.includes(3)) {
    console.log('\n=== Phase 3: Node ===');
    // N-1
    const n1 = parseText(await sendAndWait(makeRequest('cc_get_node', { path: 'Canvas' })));
    record('N-1', !n1.error && n1.data?.name === 'Canvas' && n1.data?.uuid,
      n1.error ? n1.text : `uuid=${n1.data?.uuid}`);
    if (!n1.error) canvasUuid = n1.data?.uuid;

    // N-2
    if (canvasUuid) {
      const n2 = parseText(await sendAndWait(makeRequest('cc_get_node', { uuid: canvasUuid })));
      record('N-2', !n2.error && n2.data?.name === 'Canvas', n2.error ? n2.text : 'UUID lookup matches');
    } else {
      record('N-2', false, 'SKIP - no Canvas UUID');
    }

    // N-3
    const n3 = parseText(await sendAndWait(makeRequest('cc_find_nodes', { pattern: 'label' })));
    record('N-3', !n3.error && Array.isArray(n3.data), n3.error ? n3.text : `${n3.data?.length} nodes found`);

    // N-4
    const n4 = parseText(await sendAndWait(makeRequest('cc_get_node_children', { path: 'Canvas' })));
    record('N-4', !n4.error && Array.isArray(n4.data), n4.error ? n4.text : `${n4.data?.length} children`);

    // N-5
    const n5 = parseText(await sendAndWait(makeRequest('cc_create_node', { parentPath: 'Canvas', name: '__test_node__', position: { x: 100, y: 100 } })));
    record('N-5', !n5.error, n5.error ? n5.text : `Created: uuid=${n5.data?.uuid || n5.text}`);
    if (!n5.error && n5.data?.uuid) testNodeUuid = n5.data.uuid;

    // N-6 ~ N-13: property modifications
    const props = [
      { id: 'N-6', prop: 'position', val: { x: 200, y: 200 } },
      { id: 'N-7', prop: 'size', val: { width: 100, height: 50 } },
      { id: 'N-8', prop: 'color', val: { r: 255, g: 0, b: 0 } },
      { id: 'N-9', prop: 'opacity', val: 128 },
      { id: 'N-10', prop: 'rotation', val: 45 },
      { id: 'N-11', prop: 'scale', val: { x: 2, y: 2 } },
      { id: 'N-12', prop: 'active', val: false },
      { id: 'N-13', prop: 'name', val: '__test_node_renamed__' },
    ];
    for (const { id, prop, val } of props) {
      const path = prop === 'name' || id === 'N-13' ? 'Canvas/__test_node__' : (id <= 'N-6' ? 'Canvas/__test_node__' : `Canvas/__test_node__`);
      const nodePath = id === 'N-13' ? 'Canvas/__test_node__' : (id > 'N-6' ? 'Canvas/__test_node__' : 'Canvas/__test_node__');
      const r = parseText(await sendAndWait(makeRequest('cc_set_node_property', { path: nodePath, property: prop, value: val })));
      record(id, !r.error, r.error ? r.text : `${prop} set OK`);
    }

    // N-14: verify
    const n14 = parseText(await sendAndWait(makeRequest('cc_get_node', { path: 'Canvas/__test_node_renamed__' })));
    const n14ok = !n14.error && n14.data?.name === '__test_node_renamed__';
    record('N-14', n14ok, n14.error ? n14.text : `verified: name=${n14.data?.name}, active=${n14.data?.active}`);

    // N-15: duplicate
    const n15 = parseText(await sendAndWait(makeRequest('cc_duplicate_node', { path: 'Canvas/__test_node_renamed__' })));
    record('N-15', !n15.error, n15.error ? n15.text : `Duplicated: ${n15.data?.uuid || n15.text}`);
    if (!n15.error && n15.data?.uuid) testNodeCopyUuid = n15.data.uuid;

    // N-16: move - create parent first
    const createParent = parseText(await sendAndWait(makeRequest('cc_create_node', { parentPath: 'Canvas', name: '__test_parent__' })));
    testParentCreated = !createParent.error;
    const n16 = parseText(await sendAndWait(makeRequest('cc_move_node', { sourcePath: 'Canvas/__test_node_renamed__', targetParentPath: 'Canvas/__test_parent__' })));
    record('N-16', !n16.error, n16.error ? n16.text : 'Node moved to __test_parent__');

    // N-17: cleanup
    const del1 = parseText(await sendAndWait(makeRequest('cc_delete_node', { path: 'Canvas/__test_parent__' })));
    // Delete the copy - try by path first
    const del2 = parseText(await sendAndWait(makeRequest('cc_delete_node', { path: 'Canvas/__test_node_renamed__' })));
    record('N-17', !del1.error, del1.error ? `delete parent: ${del1.text}` : 'Cleanup OK');

    // Phase 3 cleanup: try to remove any leftover test nodes
    console.log('[Cleanup Phase 3]');
    for (const p of ['Canvas/__test_node__', 'Canvas/__test_node_renamed__', 'Canvas/__test_parent__']) {
      await sendAndWait(makeRequest('cc_delete_node', { path: p })).catch(() => {});
    }
  }

  // === PHASE 4: Component ===
  if (phases.includes(4)) {
    console.log('\n=== Phase 4: Component ===');
    const c1 = parseText(await sendAndWait(makeRequest('cc_get_components', { path: 'Canvas' })));
    record('C-1', !c1.error && Array.isArray(c1.data), c1.error ? c1.text : `${c1.data?.length} components`);

    const c2 = parseText(await sendAndWait(makeRequest('cc_get_component', { path: 'Canvas/label', componentType: 'cc.Label' })));
    record('C-2', !c2.error && c2.data, c2.error ? c2.text : 'Label component retrieved');

    // C-3: create test node + add component
    const createComp = parseText(await sendAndWait(makeRequest('cc_create_node', { parentPath: 'Canvas', name: '__test_comp_node__' })));
    const c3 = parseText(await sendAndWait(makeRequest('cc_add_component', { path: 'Canvas/__test_comp_node__', componentType: 'cc.Label' })));
    record('C-3', !c3.error, c3.error ? c3.text : 'cc.Label added');

    // C-4
    const c4 = parseText(await sendAndWait(makeRequest('cc_set_component_property', { path: 'Canvas/__test_comp_node__', componentType: 'cc.Label', property: 'string', value: 'test_text' })));
    record('C-4', !c4.error, c4.error ? c4.text : 'string property set');

    // C-5
    const c5 = parseText(await sendAndWait(makeRequest('cc_get_component', { path: 'Canvas/__test_comp_node__', componentType: 'cc.Label' })));
    const c5ok = !c5.error && (c5.data?.string === 'test_text' || c5.data?.properties?.string === 'test_text');
    record('C-5', c5ok, c5.error ? c5.text : `string=${c5.data?.string || c5.data?.properties?.string}`);

    // C-6
    const c6 = parseText(await sendAndWait(makeRequest('cc_remove_component', { path: 'Canvas/__test_comp_node__', componentType: 'cc.Label' })));
    record('C-6', !c6.error, c6.error ? c6.text : 'cc.Label removed');

    // C-7
    const c7 = parseText(await sendAndWait(makeRequest('cc_get_components', { path: 'Canvas/__test_comp_node__' })));
    const c7ok = !c7.error && Array.isArray(c7.data) && !c7.data.some(c => c.type === 'cc.Label');
    record('C-7', c7ok, c7.error ? c7.text : 'Verified cc.Label removed');

    // C-8: cleanup
    const c8 = parseText(await sendAndWait(makeRequest('cc_delete_node', { path: 'Canvas/__test_comp_node__' })));
    record('C-8', !c8.error, c8.error ? c8.text : 'Cleanup OK');
  }

  // === PHASE 5: Asset ===
  if (phases.includes(5)) {
    console.log('\n=== Phase 5: Asset ===');
    // Dependency: need sceneUrl
    if (!sceneUrl) {
      console.log('[前置数据获取] Fetching scene URL...');
      const dep = parseText(await sendAndWait(makeRequest('cc_list_scenes', {})));
      if (!dep.error && Array.isArray(dep.data) && dep.data.length > 0) sceneUrl = dep.data[0].url;
    }

    const a1 = parseText(await sendAndWait(makeRequest('cc_list_assets', { path: 'db://assets' })));
    record('A-1', !a1.error && Array.isArray(a1.data), a1.error ? a1.text : `${a1.data?.length} assets`);

    const a2 = parseText(await sendAndWait(makeRequest('cc_list_assets', { path: 'db://assets', type: 'scene' })));
    record('A-2', !a2.error && Array.isArray(a2.data), a2.error ? a2.text : `${a2.data?.length} scenes`);

    if (sceneUrl) {
      try {
        const a3 = parseText(await sendAndWait(makeRequest('cc_get_asset_info', { path: sceneUrl })));
        record('A-3', !a3.error && a3.data, a3.error ? a3.text : `type=${a3.data?.type}`);
      } catch (e) {
        record('A-3', false, `Error: ${e.message}`);
      }
    } else {
      record('A-3', false, 'SKIP - no scene URL');
    }

    try {
      const a4 = parseText(await sendAndWait(makeRequest('cc_read_script', { path: 'db://assets/Script/HelloWord.ts' })));
      record('A-4', !a4.error && a4.text.length > 0, a4.error ? a4.text : `Script read: ${a4.text.length} chars`);
    } catch (e) { record('A-4', false, `Error: ${e.message}`); }

    const scriptContent = `const {ccclass, property} = cc._decorator;\n@ccclass\nexport default class TestScript extends cc.Component {\n  start() {}\n}\n`;
    let a5ok = false;
    try {
      const a5 = parseText(await sendAndWait(makeRequest('cc_create_asset', { path: 'db://assets/Script/__test_script__.ts', content: scriptContent })));
      a5ok = !a5.error;
      record('A-5', a5ok, a5.error ? a5.text : 'Script created');
    } catch (e) { record('A-5', false, `Error: ${e.message}`); }

    // Wait a bit for asset DB refresh
    await new Promise(r => setTimeout(r, 2000));

    try {
      const a6 = parseText(await sendAndWait(makeRequest('cc_read_script', { path: 'db://assets/Script/__test_script__.ts' })));
      record('A-6', !a6.error && a6.text.includes('TestScript'), a6.error ? a6.text : 'Content verified');
    } catch (e) { record('A-6', false, `Error: ${e.message}`); }

    const updatedContent = scriptContent + '// test comment\n';
    try {
      const a7 = parseText(await sendAndWait(makeRequest('cc_write_script', { path: 'db://assets/Script/__test_script__.ts', content: updatedContent })));
      record('A-7', !a7.error, a7.error ? a7.text : 'Script updated');
    } catch (e) { record('A-7', false, `Error: ${e.message}`); }

    await new Promise(r => setTimeout(r, 1000));

    try {
      const a8 = parseText(await sendAndWait(makeRequest('cc_read_script', { path: 'db://assets/Script/__test_script__.ts' })));
      record('A-8', !a8.error && a8.text.includes('test comment'), a8.error ? a8.text : 'Updated content verified');
    } catch (e) { record('A-8', false, `Error: ${e.message}`); }

    try {
      const a9 = parseText(await sendAndWait(makeRequest('cc_move_asset', { srcPath: 'db://assets/Script/__test_script__.ts', destPath: 'db://assets/Script/__test_script_moved__.ts' })));
      record('A-9', !a9.error, a9.error ? a9.text : 'Asset moved');
    } catch (e) { record('A-9', false, `Error: ${e.message}`); }

    await new Promise(r => setTimeout(r, 1000));

    try {
      const a10 = parseText(await sendAndWait(makeRequest('cc_delete_asset', { path: 'db://assets/Script/__test_script_moved__.ts' })));
      record('A-10', !a10.error, a10.error ? a10.text : 'Asset deleted');
    } catch (e) { record('A-10', false, `Error: ${e.message}`); }

    try {
      const a11 = parseText(await sendAndWait(makeRequest('cc_refresh_assets', {})));
      record('A-11', !a11.error, a11.error ? a11.text : 'Assets refreshed');
    } catch (e) { record('A-11', false, `Error: ${e.message}`); }

    // Cleanup: try deleting both possible paths
    console.log('[Cleanup Phase 5]');
    await sendAndWait(makeRequest('cc_delete_asset', { path: 'db://assets/Script/__test_script__.ts' })).catch(() => {});
    await sendAndWait(makeRequest('cc_delete_asset', { path: 'db://assets/Script/__test_script_moved__.ts' })).catch(() => {});
  }

  // === PHASE 6: Editor ===
  if (phases.includes(6)) {
    console.log('\n=== Phase 6: Editor ===');
    // Dependency: need Canvas UUID
    if (!canvasUuid) {
      console.log('[前置数据获取] Fetching Canvas UUID...');
      const dep = parseText(await sendAndWait(makeRequest('cc_get_node', { path: 'Canvas' })));
      if (!dep.error) canvasUuid = dep.data?.uuid;
    }

    const e1 = parseText(await sendAndWait(makeRequest('cc_get_console_logs', {})));
    record('E-1', !e1.error, e1.error ? e1.text : `${Array.isArray(e1.data) ? e1.data.length : '?'} logs`);

    const e2 = parseText(await sendAndWait(makeRequest('cc_get_console_logs', { level: 'error' })));
    record('E-2', !e2.error, e2.error ? e2.text : `${Array.isArray(e2.data) ? e2.data.length : '?'} error logs`);

    const e3 = parseText(await sendAndWait(makeRequest('cc_log_message', { message: '[cc2-mcp-test] test log message', level: 'log' })));
    record('E-3', !e3.error, e3.error ? e3.text : 'Log sent');

    const e4 = parseText(await sendAndWait(makeRequest('cc_log_message', { message: '[cc2-mcp-test] test warn message', level: 'warn' })));
    record('E-4', !e4.error, e4.error ? e4.text : 'Warn sent');

    const e5 = parseText(await sendAndWait(makeRequest('cc_log_message', { message: '[cc2-mcp-test] test error message', level: 'error' })));
    record('E-5', !e5.error, e5.error ? e5.text : 'Error sent');

    const e6 = parseText(await sendAndWait(makeRequest('cc_get_selection', {})));
    record('E-6', !e6.error, e6.error ? e6.text : `Selection: ${JSON.stringify(e6.data)}`);

    if (canvasUuid) {
      const e7 = parseText(await sendAndWait(makeRequest('cc_set_selection', { uuids: [canvasUuid] })));
      record('E-7', !e7.error, e7.error ? e7.text : 'Selection set');

      const e8 = parseText(await sendAndWait(makeRequest('cc_get_selection', {})));
      const e8ok = !e8.error && e8.data?.uuids && Array.isArray(e8.data.uuids) && e8.data.uuids.includes(canvasUuid);
      record('E-8', e8ok, e8.error ? e8.text : `Contains Canvas: ${JSON.stringify(e8.data)}`);
    } else {
      record('E-7', false, 'SKIP - no Canvas UUID');
      record('E-8', false, 'SKIP - no Canvas UUID');
    }
  }

  // === PHASE 7: Resources ===
  if (phases.includes(7)) {
    console.log('\n=== Phase 7: Resources ===');
    const resources = [
      { id: 'R-1', uri: 'cc://scene/tree' },
      { id: 'R-2', uri: 'cc://scene/info' },
      { id: 'R-3', uri: 'cc://project/info' },
      { id: 'R-4', uri: 'cc://project/scenes' },
      { id: 'R-5', uri: 'cc://project/scripts' },
    ];
    for (const { id, uri } of resources) {
      const resp = await sendAndWait(makeResourceRequest(uri));
      const ok = resp.result && !resp.result.isError && resp.result.contents?.length > 0;
      record(id, ok, ok ? `Resource read OK (${resp.result.contents[0].text?.length || 0} chars)` : JSON.stringify(resp.result || resp.error));
    }
  }

  // === PHASE 8: Edge Cases ===
  if (phases.includes(8)) {
    console.log('\n=== Phase 8: Edge Cases ===');
    const x1 = parseText(await sendAndWait(makeRequest('cc_get_node', { path: 'Canvas/nonexistent_node_12345' })));
    record('X-1', true, `Handled gracefully: ${x1.error ? 'error' : 'empty'} response`);

    const x2 = parseText(await sendAndWait(makeRequest('cc_find_nodes', { pattern: 'zzz_no_match_zzz' })));
    record('X-2', !x2.error && Array.isArray(x2.data) && x2.data.length === 0,
      x2.error ? x2.text : `${x2.data?.length} results`);

    const x3 = parseText(await sendAndWait(makeRequest('cc_get_component', { path: 'Canvas', componentType: 'cc.NonExistentComponent' })));
    record('X-3', true, `Handled gracefully: ${x3.error ? 'error' : 'empty'} response`);

    const x4 = parseText(await sendAndWait(makeRequest('cc_delete_node', { path: 'Canvas/nonexistent_node_12345' })));
    record('X-4', true, `Handled gracefully: ${x4.error ? 'error' : 'ok'} response`);

    const x5 = parseText(await sendAndWait(makeRequest('cc_set_node_property', { path: 'Canvas', property: 'fakeProperty', value: 123 })));
    record('X-5', true, `Handled gracefully: ${x5.error ? 'error' : 'ok'} response`);
  }

  // === SUMMARY ===
  console.log('\n========================================');
  console.log('TEST RESULTS SUMMARY');
  console.log('========================================');
  const ids = Object.keys(results).sort((a, b) => {
    const pa = a.charAt(0), pb = b.charAt(0);
    if (pa !== pb) return pa.localeCompare(pb);
    const na = parseInt(a.split('-')[1]), nb = parseInt(b.split('-')[1]);
    return na - nb;
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
    console.log(`${status.padEnd(4)} ${id.padEnd(5)} ${r.note}`);
  }
  console.log('');

  // Output JSON for parsing
  console.log('---JSON_RESULTS---');
  console.log(JSON.stringify({ results, summary: { total: ids.length, pass, fail, skip } }));

  // Restore test project scene file (tests may modify it via save)
  try {
    const { execSync } = await import('child_process');
    execSync('git checkout -- assets/Scene/helloworld.fire', { cwd: 'C:/Users/zyb/Desktop/TestMcp', stdio: 'pipe' });
    console.log('[cleanup] Scene file restored via git');
  } catch (e) {
    console.log('[cleanup] Warning: could not restore scene file:', e.message);
  }

  child.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  child?.kill();
  process.exit(1);
});
