'use strict';

var WebSocket = require('ws');
var fs = require('fs');
var path = require('path');
var serializer = require('./utils/serializer');

var PORT = 9531;
var wss = null;
var client = null;
var pendingSceneOpen = null; // { ws, id } — waiting for scene:ready after openScene

// ---- WebSocket Server ----

function startServer() {
  if (wss) return;
  wss = new WebSocket.Server({ port: PORT, host: '127.0.0.1' });
  Editor.log('[cc2-mcp-bridge] WebSocket server listening on port ' + PORT);

  wss.on('connection', function (ws) {
    Editor.log('[cc2-mcp-bridge] MCP Server connected');
    client = ws;

    ws.on('message', function (raw) {
      try {
        var msg = JSON.parse(raw);
        if (msg.type === 'request') {
          handleRequest(msg, ws);
        }
      } catch (e) {
        Editor.error('[cc2-mcp-bridge] Failed to parse message: ' + e.message);
      }
    });

    ws.on('close', function () {
      Editor.log('[cc2-mcp-bridge] MCP Server disconnected');
      if (client === ws) client = null;
    });
  });
}

function stopServer() {
  if (wss) {
    wss.close();
    wss = null;
    client = null;
    Editor.log('[cc2-mcp-bridge] WebSocket server stopped');
  }
}

// ---- Request Router ----

function handleRequest(req, ws) {
  var domain = req.domain;
  var method = req.method;
  var params = req.params || {};

  if (domain === 'scene') {
    handleScene(req, ws, method, params);
  } else if (domain === 'asset') {
    handleAsset(req, ws, method, params);
  } else if (domain === 'project') {
    handleProject(req, ws, method, params);
  } else if (domain === 'editor') {
    handleEditor(req, ws, method, params);
  } else {
    sendError(ws, req.id, 'UNKNOWN_DOMAIN', 'Unknown domain: ' + domain);
  }
}

function sendResponse(ws, id, data) {
  ws.send(JSON.stringify({ id: id, type: 'response', success: true, data: data }));
}

function sendError(ws, id, code, message) {
  ws.send(JSON.stringify({ id: id, type: 'response', success: false, error: { code: code, message: message } }));
}

// ---- Scene Domain ----

function handleScene(req, ws, method, params) {
  Editor.Scene.callSceneScript('cc2-mcp-bridge', method, params, function (err, result) {
    if (err) {
      sendError(ws, req.id, 'SCENE_ERROR', String(err));
    } else {
      sendResponse(ws, req.id, result);
    }
  });
}

// ---- Asset Domain ----

function handleAsset(req, ws, method, params) {
  switch (method) {
    case 'queryAssets':
      Editor.assetdb.queryAssets(
        params.pattern || 'db://assets/**/*',
        params.type || null,
        function (err, results) {
          if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
          var items = results.map(function (r) {
            return { url: r.url, path: r.path, uuid: r.uuid, type: r.type };
          });
          sendResponse(ws, req.id, items);
        }
      );
      break;

    case 'queryPathByUuid':
      // Editor.assetdb.queryPathByUuid does NOT exist in CC2 — use queryAssets fallback
      Editor.assetdb.queryAssets('db://assets/**/*', null, function (err, results) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        var found = null;
        for (var i = 0; i < (results || []).length; i++) {
          if (results[i].uuid === params.uuid) { found = results[i]; break; }
        }
        if (!found) return sendError(ws, req.id, 'ASSET_ERROR', 'Asset not found for uuid: ' + params.uuid);
        sendResponse(ws, req.id, { path: found.path || dbUrlToAbsPath(found.url) });
      });
      break;

    case 'queryUuidByUrl':
      Editor.assetdb.queryUuidByUrl(params.url, function (err, uuid) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        sendResponse(ws, req.id, { uuid: uuid });
      });
      break;

    case 'queryInfoByUuid':
      // Editor.assetdb.queryInfoByUuid does NOT exist in CC2 — use queryAssets fallback
      Editor.assetdb.queryAssets('db://assets/**/*', null, function (err, results) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        var found = null;
        for (var i = 0; i < (results || []).length; i++) {
          if (results[i].uuid === params.uuid) { found = results[i]; break; }
        }
        if (!found) return sendError(ws, req.id, 'ASSET_ERROR', 'Asset not found for uuid: ' + params.uuid);
        sendResponse(ws, req.id, found);
      });
      break;

    case 'getAssetInfoByUrl':
      // Use queryAssets to find asset by URL (queryUuidByUrl callback often never fires)
      Editor.assetdb.queryAssets(params.url, null, function (err, results) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        if (results && results.length > 0) {
          var r = results[0];
          sendResponse(ws, req.id, { url: r.url, path: r.path, uuid: r.uuid, type: r.type });
        } else {
          sendError(ws, req.id, 'ASSET_ERROR', 'Asset not found: ' + params.url);
        }
      });
      break;

    case 'queryUrlByUuid':
      Editor.assetdb.queryUrlByUuid(params.uuid, function (err, url) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        sendResponse(ws, req.id, { url: url });
      });
      break;

    case 'createAsset': {
      // Auto-create parent directories (Editor.assetdb.create can't do this)
      var absPath = dbUrlToAbsPath(params.url);
      var parentDir = path.dirname(absPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
        // Refresh so assetdb recognizes the new directory
        Editor.assetdb.refresh('db://assets', function () {
          Editor.assetdb.create(params.url, params.content || '', function (err, results) {
            if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
            sendResponse(ws, req.id, results);
          });
        });
      } else {
        Editor.assetdb.create(params.url, params.content || '', function (err, results) {
          if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
          sendResponse(ws, req.id, results);
        });
      }
      break;
    }

    case 'deleteAsset':
      Editor.assetdb.delete([params.url], function (err) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        sendResponse(ws, req.id, { success: true });
      });
      break;

    case 'moveAsset':
      Editor.assetdb.move(params.srcUrl, params.destUrl, function (err) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        sendResponse(ws, req.id, { success: true });
      });
      break;

    case 'refresh':
      Editor.assetdb.refresh(params.url || 'db://assets', function (err) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        sendResponse(ws, req.id, { success: true });
      });
      break;

    default:
      sendError(ws, req.id, 'UNKNOWN_METHOD', 'Unknown asset method: ' + method);
  }
}

// ---- Project Domain ----

var fs = require('fs');
var path = require('path');

function dbUrlToAbsPath(url) {
  // Convert db://assets/... to absolute path
  if (!url || !url.startsWith('db://assets')) return null;
  var projectPath = Editor.Project.path || Editor.projectPath;
  var relPath = url.replace('db://assets', 'assets');
  return path.join(projectPath, relPath);
}

/**
 * Resolve asset UUID to absolute file path.
 * In CC2, queryPathByUuid / queryInfoByUuid do NOT exist.
 * queryUrlByUuid exists but callback often never fires.
 * Only queryAssets is reliable — use it with a glob pattern.
 */
function resolveUuidToPath(uuid, globPattern, cb) {
  Editor.assetdb.queryAssets(globPattern, null, function (err, results) {
    if (err) return cb(err);
    var found = null;
    for (var i = 0; i < (results || []).length; i++) {
      if (results[i].uuid === uuid) { found = results[i]; break; }
    }
    if (!found) return cb('Asset not found for uuid: ' + uuid);
    cb(null, found.path || dbUrlToAbsPath(found.url), found.url);
  });
}

function handleProject(req, ws, method, params) {
  switch (method) {
    case 'getInfo': {
      var projectPath = Editor.Project.path || Editor.projectPath;
      var name = path.basename(projectPath);
      var engineVer = '';
      try {
        var pkgPath = path.join(projectPath, 'project.json');
        if (fs.existsSync(pkgPath)) {
          var pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          engineVer = pkg.engine || pkg.version || '';
        }
      } catch (e) { /* ignore */ }
      sendResponse(ws, req.id, { path: projectPath, name: name, engineVersion: engineVer });
      break;
    }

    case 'listScenes':
      Editor.assetdb.queryAssets('db://assets/**/*.fire', 'scene', function (err, results) {
        if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
        var scenes = results.map(function (r) { return { url: r.url, uuid: r.uuid }; });
        sendResponse(ws, req.id, scenes);
      });
      break;

    case 'listScripts': {
      var projectPathLS = Editor.Project.path || Editor.projectPath;
      var basePath = params.path ? ('db://' + params.path) : 'db://assets';
      // Query both JS and TS scripts
      var jsPattern = basePath + '/**/*.js';
      var tsPattern = basePath + '/**/*.ts';
      Editor.assetdb.queryAssets(jsPattern, 'javascript', function (err, jsResults) {
        if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
        Editor.assetdb.queryAssets(tsPattern, 'typescript', function (err2, tsResults) {
          if (err2) {
            // Fallback: typescript type might not be recognized, try without type filter
            Editor.assetdb.queryAssets(tsPattern, null, function (err3, tsResults2) {
              var allResults = (jsResults || []).concat(tsResults2 || []);
              var scripts = allResults.map(function (r) { return { url: r.url, uuid: r.uuid }; });
              sendResponse(ws, req.id, scripts);
            });
            return;
          }
          var allResults = (jsResults || []).concat(tsResults || []);
          var scripts = allResults.map(function (r) { return { url: r.url, uuid: r.uuid }; });
          sendResponse(ws, req.id, scripts);
        });
      });
      break;
    }

    case 'getSettings': {
      var projectPath2 = Editor.Project.path || Editor.projectPath;
      var settingsDir = path.join(projectPath2, 'settings');
      var category = params.category || 'project';
      var filePath = path.join(settingsDir, category + '.json');
      try {
        if (fs.existsSync(filePath)) {
          var content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          sendResponse(ws, req.id, content);
        } else {
          sendResponse(ws, req.id, null);
        }
      } catch (e) {
        sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to read settings: ' + e.message);
      }
      break;
    }

    case 'readScript': {
      var url = params.url || params.path;
      var uuid = params.uuid;
      if (uuid) {
        resolveUuidToPath(uuid, 'db://assets/**/*.{js,ts}', function (err, absPath) {
          if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
          try {
            sendResponse(ws, req.id, { path: absPath, content: fs.readFileSync(absPath, 'utf8') });
          } catch (e) {
            sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to read: ' + e.message);
          }
        });
      } else if (url) {
        // Try direct file path first (queryPathByUrl may not callback for .ts files)
        var directPath = dbUrlToAbsPath(url);
        if (directPath && fs.existsSync(directPath)) {
          try {
            sendResponse(ws, req.id, { path: directPath, content: fs.readFileSync(directPath, 'utf8') });
          } catch (e) {
            sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to read: ' + e.message);
          }
        } else {
          Editor.assetdb.queryPathByUrl(url, function (err, absPath) {
            if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
            try {
              sendResponse(ws, req.id, { path: absPath, content: fs.readFileSync(absPath, 'utf8') });
            } catch (e) {
              sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to read: ' + e.message);
            }
          });
        }
      } else {
        sendError(ws, req.id, 'PROJECT_ERROR', 'uuid or url required');
      }
      break;
    }

    case 'writeScript': {
      var wUrl = params.url || params.path;
      if (!wUrl) return sendError(ws, req.id, 'PROJECT_ERROR', 'url required');
      // Try direct file path first
      var wDirectPath = dbUrlToAbsPath(wUrl);
      if (wDirectPath && fs.existsSync(wDirectPath)) {
        try {
          fs.writeFileSync(wDirectPath, params.content, 'utf8');
          Editor.assetdb.refresh(wUrl, function () {
            sendResponse(ws, req.id, { success: true });
          });
        } catch (e) {
          sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to write: ' + e.message);
        }
      } else {
        Editor.assetdb.queryPathByUrl(wUrl, function (err, absPath) {
          if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
          try {
            fs.writeFileSync(absPath, params.content, 'utf8');
            Editor.assetdb.refresh(wUrl, function () {
              sendResponse(ws, req.id, { success: true });
            });
          } catch (e) {
            sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to write: ' + e.message);
          }
        });
      }
      break;
    }

    case 'readAnimClip': {
      var animUrl = params.url;
      var animUuid = params.uuid;

      function parseAnimClip(absPath) {
        try {
          var raw = fs.readFileSync(absPath, 'utf8');
          var arr = JSON.parse(raw);
          // .anim is a JSON array; find the cc.AnimationClip entry
          var clip = null;
          for (var i = 0; i < arr.length; i++) {
            if (arr[i].__type__ === 'cc.AnimationClip') { clip = arr[i]; break; }
          }
          if (!clip) throw new Error('No cc.AnimationClip found in file');
          // Flatten curveData into tracks
          var tracks = [];
          var curveData = clip.curveData || {};
          var paths = curveData.paths || {};
          // Also handle root-level props (path "")
          if (curveData.props) {
            paths[''] = paths[''] || {};
            paths[''].props = Object.assign(paths[''].props || {}, curveData.props);
          }
          for (var nodePath in paths) {
            var pathData = paths[nodePath];
            if (pathData.props) {
              for (var propName in pathData.props) {
                tracks.push({
                  path: nodePath,
                  component: null,
                  property: propName,
                  keyframes: pathData.props[propName],
                });
              }
            }
            if (pathData.comps) {
              for (var compName in pathData.comps) {
                var compProps = pathData.comps[compName];
                for (var cprop in compProps) {
                  tracks.push({
                    path: nodePath,
                    component: compName,
                    property: cprop,
                    keyframes: compProps[cprop],
                  });
                }
              }
            }
          }
          sendResponse(ws, req.id, {
            name: clip._name,
            duration: clip._duration,
            sample: clip.sample,
            speed: clip.speed,
            wrapMode: clip.wrapMode,
            tracks: tracks,
            raw: clip,
          });
        } catch (e) {
          sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to parse .anim: ' + e.message);
        }
      }

      if (animUuid) {
        resolveUuidToPath(animUuid, 'db://assets/**/*.anim', function (err, absPath) {
          if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
          parseAnimClip(absPath);
        });
      } else if (animUrl) {
        var directPath = dbUrlToAbsPath(animUrl);
        if (directPath && fs.existsSync(directPath)) {
          parseAnimClip(directPath);
        } else {
          Editor.assetdb.queryPathByUrl(animUrl, function (err, absPath) {
            if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
            parseAnimClip(absPath);
          });
        }
      } else {
        sendError(ws, req.id, 'PROJECT_ERROR', 'uuid or url required');
      }
      break;
    }

    case 'editAnimClip': {
      var editUrl = params.url;
      var editUuid = params.uuid;
      var changes = params.changes || {};

      function applyAnimChanges(absPath, dbUrl) {
        try {
          var raw = fs.readFileSync(absPath, 'utf8');
          var arr = JSON.parse(raw);
          var clip = null;
          for (var i = 0; i < arr.length; i++) {
            if (arr[i].__type__ === 'cc.AnimationClip') { clip = arr[i]; break; }
          }
          if (!clip) throw new Error('No cc.AnimationClip found in file');
          if (changes.duration !== undefined) clip._duration = changes.duration;
          if (changes.sample !== undefined) clip.sample = changes.sample;
          if (changes.speed !== undefined) clip.speed = changes.speed;
          if (changes.wrapMode !== undefined) clip.wrapMode = changes.wrapMode;
          if (changes.curveData !== undefined) clip.curveData = changes.curveData;
          fs.writeFileSync(absPath, JSON.stringify(arr, null, 2), 'utf8');
          var refreshUrl = dbUrl || editUrl;
          if (refreshUrl) {
            Editor.assetdb.refresh(refreshUrl, function () {
              sendResponse(ws, req.id, { success: true });
            });
          } else {
            sendResponse(ws, req.id, { success: true });
          }
        } catch (e) {
          sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to edit .anim: ' + e.message);
        }
      }

      if (editUuid) {
        resolveUuidToPath(editUuid, 'db://assets/**/*.anim', function (err, absPath, dbUrl) {
          if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
          applyAnimChanges(absPath, dbUrl);
        });
      } else if (editUrl) {
        var directPath = dbUrlToAbsPath(editUrl);
        if (directPath && fs.existsSync(directPath)) {
          applyAnimChanges(directPath, editUrl);
        } else {
          Editor.assetdb.queryPathByUrl(editUrl, function (err, absPath) {
            if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
            applyAnimChanges(absPath, editUrl);
          });
        }
      } else {
        sendError(ws, req.id, 'PROJECT_ERROR', 'uuid or url required');
      }
      break;
    }

    case 'readPrefab': {
      var prefabUrl = params.url;
      var prefabUuid = params.uuid;

      function parsePrefab(absPath) {
        try {
          var raw = fs.readFileSync(absPath, 'utf8');
          var arr = JSON.parse(raw);
          // Extract node tree structure from the prefab JSON array
          var nodes = [];
          var components = [];
          var prefabInfo = null;
          for (var i = 0; i < arr.length; i++) {
            var item = arr[i];
            if (!item || !item.__type__) continue;
            if (item.__type__ === 'cc.Prefab') {
              prefabInfo = { name: item._name, optimizationPolicy: item.optimizationPolicy, asyncLoadAssets: item.asyncLoadAssets };
            } else if (item.__type__ === 'cc.Node') {
              nodes.push({
                index: i,
                name: item._name,
                active: item._active !== false,
                position: item._position,
                scale: item._scale,
                anchor: item._anchorPoint,
                size: item._contentSize,
                childrenIds: (item._children || []).map(function (c) { return c.__id__; }),
                componentIds: (item._components || []).map(function (c) { return c.__id__; }),
              });
            } else {
              // Component or other type
              components.push({
                index: i,
                type: item.__type__,
              });
            }
          }
          sendResponse(ws, req.id, {
            prefab: prefabInfo,
            nodes: nodes,
            components: components,
            totalEntries: arr.length,
          });
        } catch (e) {
          sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to parse .prefab: ' + e.message);
        }
      }

      if (prefabUuid) {
        resolveUuidToPath(prefabUuid, 'db://assets/**/*.prefab', function (err, absPath) {
          if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
          parsePrefab(absPath);
        });
      } else if (prefabUrl) {
        var directPath = dbUrlToAbsPath(prefabUrl);
        if (directPath && fs.existsSync(directPath)) {
          parsePrefab(directPath);
        } else {
          Editor.assetdb.queryPathByUrl(prefabUrl, function (err, absPath) {
            if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
            parsePrefab(absPath);
          });
        }
      } else {
        sendError(ws, req.id, 'PROJECT_ERROR', 'uuid or url required');
      }
      break;
    }

    case 'writePrefab': {
      var wpUrl = params.url;
      var wpContent = params.content;
      if (!wpUrl) return sendError(ws, req.id, 'PROJECT_ERROR', 'url required');
      if (!wpContent) return sendError(ws, req.id, 'PROJECT_ERROR', 'content required');
      var wpDirectPath = dbUrlToAbsPath(wpUrl);
      var exists = wpDirectPath && fs.existsSync(wpDirectPath);
      if (exists) {
        // Overwrite existing prefab
        try {
          fs.writeFileSync(wpDirectPath, wpContent, 'utf8');
          Editor.assetdb.refresh(wpUrl, function () {
            sendResponse(ws, req.id, { success: true });
          });
        } catch (e) {
          sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to write prefab: ' + e.message);
        }
      } else {
        // Create new prefab via assetdb (auto-create parent dirs)
        var wpParentDir = path.dirname(wpDirectPath);
        if (wpParentDir && !fs.existsSync(wpParentDir)) {
          fs.mkdirSync(wpParentDir, { recursive: true });
          Editor.assetdb.refresh('db://assets', function () {
            Editor.assetdb.create(wpUrl, wpContent, function (err, results) {
              if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
              sendResponse(ws, req.id, { success: true, results: results });
            });
          });
        } else {
          Editor.assetdb.create(wpUrl, wpContent, function (err, results) {
            if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
            sendResponse(ws, req.id, { success: true, results: results });
          });
        }
      }
      break;
    }

    default:
      sendError(ws, req.id, 'UNKNOWN_METHOD', 'Unknown project method: ' + method);
  }
}

// ---- Editor Domain ----

var consoleLogs = [];
var MAX_LOGS = 200;

function captureLog(level, msg) {
  consoleLogs.push({ level: level, message: msg, timestamp: Date.now() });
  if (consoleLogs.length > MAX_LOGS) consoleLogs.shift();
}

function handleEditor(req, ws, method, params) {
  switch (method) {
    case 'getConsoleLogs': {
      var count = params.count || 50;
      var level = params.level;
      var logs = consoleLogs;
      if (level) logs = logs.filter(function (l) { return l.level === level; });
      sendResponse(ws, req.id, logs.slice(-count));
      break;
    }

    case 'logMessage':
      var lvl = params.level || 'log';
      var msg = params.message || '';
      if (lvl === 'warn') Editor.warn(msg);
      else if (lvl === 'error') Editor.error(msg);
      else Editor.log(msg);
      sendResponse(ws, req.id, { success: true });
      break;

    case 'getSelection': {
      var type = params.type || 'node';
      var uuids = Editor.Selection.curSelection(type);
      sendResponse(ws, req.id, { type: type, uuids: uuids });
      break;
    }

    case 'setSelection': {
      var selType = params.type || 'node';
      Editor.Selection.clear(selType);
      (params.uuids || []).forEach(function (uuid) {
        Editor.Selection.select(selType, uuid);
      });
      sendResponse(ws, req.id, { success: true });
      break;
    }

    case 'buildProject':
      Editor.Ipc.sendToMain('builder:start-task', {
        platform: params.platform || 'web-mobile',
        buildPath: params.buildPath || 'build',
      });
      sendResponse(ws, req.id, { success: true, message: 'Build started' });
      break;

    case 'previewProject': {
      // Use Electron shell to open preview URL directly (preview-server:open IPC is unreliable)
      var electron = require('electron');
      var previewUrl = 'http://localhost:7456';
      if (params.browser) {
        previewUrl += '?browser=' + params.browser;
      }
      electron.shell.openExternal(previewUrl);
      sendResponse(ws, req.id, { success: true, message: 'Preview started' });
      break;
    }

    case 'openScene':
      if (params.url) {
        // First check if the same scene is already open via scene script
        Editor.Scene.callSceneScript('cc2-mcp-bridge', 'getCurrentSceneInfo', null, function (err, info) {
          if (!err && info && info.uuid) {
            // Check if requested scene matches the currently loaded scene
            Editor.assetdb.queryAssets(params.url, null, function (err2, results) {
              if (!err2 && results && results.length > 0 && results[0].uuid === info.uuid) {
                // Same scene already open — respond immediately
                sendResponse(ws, req.id, { success: true, alreadyOpen: true });
                return;
              }
              // Different scene — send open and wait for scene:ready
              pendingSceneOpen = { ws: ws, id: req.id };
              Editor.Ipc.sendToMain('scene:open-by-url', params.url);
            });
          } else {
            // Can't determine current scene — just send open and wait
            pendingSceneOpen = { ws: ws, id: req.id };
            Editor.Ipc.sendToMain('scene:open-by-url', params.url);
          }
        });
      } else {
        sendError(ws, req.id, 'EDITOR_ERROR', 'url required');
      }
      break;

    case 'saveScene':
      var _saveWs = ws;
      var _saveId = req.id;
      // Get current scene info to find the UUID
      Editor.Scene.callSceneScript('cc2-mcp-bridge', 'getCurrentSceneInfo', null, function (err0, sceneInfo) {
        if (err0 || !sceneInfo) {
          sendError(_saveWs, _saveId, 'SAVE_ERROR', 'Cannot get scene info: ' + (err0 || 'no scene'));
          return;
        }
        // Serialize the scene in the render process using Editor.serialize
        Editor.Scene.callSceneScript('cc2-mcp-bridge', 'serializeSceneToJson', null, function (err, jsonData) {
          if (err) {
            sendError(_saveWs, _saveId, 'SAVE_ERROR', 'Serialize failed: ' + err);
            return;
          }
          if (!jsonData || typeof jsonData !== 'string') {
            sendError(_saveWs, _saveId, 'SAVE_ERROR', 'Serialized data is empty or not a string, type: ' + typeof jsonData);
            return;
          }
          // Find scene file path via queryAssets
          Editor.assetdb.queryAssets('db://assets/**/*.fire', 'scene', function (err2, results) {
            if (err2 || !results) {
              sendError(_saveWs, _saveId, 'SAVE_ERROR', 'queryAssets failed: ' + err2);
              return;
            }
            var sceneAsset = null;
            for (var i = 0; i < results.length; i++) {
              if (results[i].uuid === sceneInfo.uuid) { sceneAsset = results[i]; break; }
            }
            // Fallback: runtime UUID often differs from assetdb UUID in CC2
            // Try matching by scene name, or use the only scene if there's just one
            if (!sceneAsset) {
              if (results.length === 1) {
                sceneAsset = results[0];
              } else {
                for (var j = 0; j < results.length; j++) {
                  var baseName = results[j].url.replace(/^.*\//, '').replace(/\.fire$/, '');
                  if (baseName === sceneInfo.name || baseName.toLowerCase() === sceneInfo.name.toLowerCase()) {
                    sceneAsset = results[j]; break;
                  }
                }
              }
            }
            if (!sceneAsset || !sceneAsset.path) {
              sendError(_saveWs, _saveId, 'SAVE_ERROR', 'Scene file not found for uuid: ' + sceneInfo.uuid);
              return;
            }
            try {
              fs.writeFileSync(sceneAsset.path, jsonData, 'utf8');
              // Refresh asset database so editor picks up the change
              Editor.assetdb.refresh(sceneAsset.url, function () {
                sendResponse(_saveWs, _saveId, { success: true });
              });
            } catch (writeErr) {
              sendError(_saveWs, _saveId, 'SAVE_ERROR', 'Write failed: ' + writeErr.message);
            }
          });
        });
      });
      break;

    default:
      sendError(ws, req.id, 'UNKNOWN_METHOD', 'Unknown editor method: ' + method);
  }
}

// ---- Extension Lifecycle ----

module.exports = {
  load: function () {
    startServer();
  },

  unload: function () {
    stopServer();
  },

  messages: {
    'start-server': function () { startServer(); },
    'stop-server': function () { stopServer(); },
    'scene:ready': function () {
      Editor.log('[cc2-mcp-bridge] Scene ready');
      // Resolve pending openScene request
      if (pendingSceneOpen) {
        try {
          sendResponse(pendingSceneOpen.ws, pendingSceneOpen.id, { success: true });
        } catch (e) { /* ws may be closed */ }
        pendingSceneOpen = null;
      }
    },
  },
};
