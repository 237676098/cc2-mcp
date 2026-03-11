'use strict';

var WebSocket = require('ws');
var serializer = require('./utils/serializer');

var PORT = 9531;
var wss = null;
var client = null;

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
      Editor.assetdb.queryPathByUuid(params.uuid, function (err, path) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        sendResponse(ws, req.id, { path: path });
      });
      break;

    case 'queryUuidByUrl':
      Editor.assetdb.queryUuidByUrl(params.url, function (err, uuid) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        sendResponse(ws, req.id, { uuid: uuid });
      });
      break;

    case 'queryInfoByUuid':
      Editor.assetdb.queryInfoByUuid(params.uuid, function (err, info) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        sendResponse(ws, req.id, info);
      });
      break;

    case 'createAsset':
      Editor.assetdb.create(params.url, params.content || '', function (err, results) {
        if (err) return sendError(ws, req.id, 'ASSET_ERROR', String(err));
        sendResponse(ws, req.id, results);
      });
      break;

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
      var pattern = params.path ? ('db://' + params.path + '/**/*.js') : 'db://assets/**/*.js';
      Editor.assetdb.queryAssets(pattern, 'javascript', function (err, results) {
        if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
        var scripts = results.map(function (r) { return { url: r.url, uuid: r.uuid }; });
        sendResponse(ws, req.id, scripts);
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
        Editor.assetdb.queryPathByUuid(uuid, function (err, absPath) {
          if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
          try {
            sendResponse(ws, req.id, { path: absPath, content: fs.readFileSync(absPath, 'utf8') });
          } catch (e) {
            sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to read: ' + e.message);
          }
        });
      } else if (url) {
        Editor.assetdb.queryPathByUrl(url, function (err, absPath) {
          if (err) return sendError(ws, req.id, 'PROJECT_ERROR', String(err));
          try {
            sendResponse(ws, req.id, { path: absPath, content: fs.readFileSync(absPath, 'utf8') });
          } catch (e) {
            sendError(ws, req.id, 'PROJECT_ERROR', 'Failed to read: ' + e.message);
          }
        });
      } else {
        sendError(ws, req.id, 'PROJECT_ERROR', 'uuid or url required');
      }
      break;
    }

    case 'writeScript': {
      var wUrl = params.url || params.path;
      if (!wUrl) return sendError(ws, req.id, 'PROJECT_ERROR', 'url required');
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

    case 'previewProject':
      Editor.Ipc.sendToMain('preview-server:open', {
        browser: params.browser || '',
      });
      sendResponse(ws, req.id, { success: true, message: 'Preview started' });
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
    },
  },
};
