'use strict';

var serializer = require('./utils/serializer');

// ---- Helpers ----

function getSceneRoot() {
  var scene = cc.director.getScene();
  if (!scene) throw new Error('No scene is currently open');
  return scene;
}

function findNode(params) {
  if (params.uuid) {
    var scene = getSceneRoot();
    return _findByUuid(scene, params.uuid);
  }
  if (params.path) {
    var node = cc.find(params.path);
    if (!node) throw new Error('Node not found at path: ' + params.path);
    return node;
  }
  throw new Error('Either path or uuid is required');
}

function _findByUuid(node, uuid) {
  if (node.uuid === uuid) return node;
  for (var i = 0; i < node.children.length; i++) {
    var found = _findByUuid(node.children[i], uuid);
    if (found) return found;
  }
  return null;
}

function getNodePath(node) {
  var parts = [];
  var cur = node;
  while (cur && cur.parent) {
    parts.unshift(cur.name);
    cur = cur.parent;
  }
  return parts.join('/');
}

function serializeNode(node, depth, maxDepth) {
  if (depth === undefined) depth = 0;
  if (maxDepth === undefined) maxDepth = 99;

  var result = {
    name: node.name,
    uuid: node.uuid,
    path: getNodePath(node),
    active: node.active,
    position: { x: node.x, y: node.y },
    rotation: node.rotation,
    scale: { x: node.scaleX, y: node.scaleY },
    anchor: { x: node.anchorX, y: node.anchorY },
    size: { width: node.width, height: node.height },
    opacity: node.opacity,
    color: node.color ? { r: node.color.r, g: node.color.g, b: node.color.b, a: node.color.a } : null,
    childCount: node.children.length,
    components: node._components.map(function (comp) {
      return cc.js.getClassName(comp);
    }),
  };

  if (depth < maxDepth && node.children.length > 0) {
    result.children = node.children.map(function (child) {
      return serializeNode(child, depth + 1, maxDepth);
    });
  }

  return result;
}

function serializeComponent(comp) {
  var className = cc.js.getClassName(comp);
  var result = { type: className, uuid: comp.uuid, enabled: comp.enabled, properties: {} };
  // Collect all property names from own keys and prototype chain
  var allKeys = {};
  // Own keys
  var ownKeys = Object.keys(comp);
  for (var i = 0; i < ownKeys.length; i++) allKeys[ownKeys[i]] = true;
  // Prototype getter/setter properties (where CC2 defines component props like `string`, `fontSize`, etc.)
  try {
    var proto = Object.getPrototypeOf(comp);
    while (proto && proto !== Object.prototype) {
      var names = Object.getOwnPropertyNames(proto);
      for (var n = 0; n < names.length; n++) {
        var dkey = names[n];
        try {
          var desc = Object.getOwnPropertyDescriptor(proto, dkey);
          if (desc && desc.get) allKeys[dkey] = true;
        } catch (e2) { /* skip */ }
      }
      proto = Object.getPrototypeOf(proto);
    }
  } catch (e) { /* fallback: only use own keys */ }
  var skipSet = { node: 1, uuid: 1, enabled: 1, constructor: 1 };
  for (var key in allKeys) {
    if (key.startsWith('_') || skipSet[key]) continue;
    try {
      result.properties[key] = serializer.safeSerialize(comp[key], 3);
    } catch (e) { /* skip */ }
  }
  return result;
}

// ---- Asset-reference property helpers ----

// Known component properties that reference assets (need async loading, NOT direct assignment)
var ASSET_PROPS = {
  spriteFrame: 1, spriteAtlas: 1, font: 1, clip: 1, defaultClip: 1,
  normalSprite: 1, pressedSprite: 1, hoverSprite: 1, disabledSprite: 1,
};

// UUID pattern: 8-4-4-4-12 hex or 32 hex without dashes
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract a UUID string from various value formats.
 * Returns null if value is not a UUID reference.
 */
function extractUuid(val) {
  if (typeof val === 'string' && UUID_RE.test(val)) return val;
  if (val && typeof val === 'object') {
    if (typeof val.uuid === 'string' && UUID_RE.test(val.uuid)) return val.uuid;
    if (typeof val.__uuid__ === 'string' && UUID_RE.test(val.__uuid__)) return val.__uuid__;
  }
  return null;
}

/**
 * Load an asset by UUID and assign it to a component property.
 * Uses {uuid: ...} format for cc.assetManager.loadAny (explicit UUID loading).
 */
function loadAndSetAssetProperty(comp, prop, uuid, event) {
  cc.assetManager.loadAny({ uuid: uuid }, function (err, asset) {
    if (err || !asset) {
      event.reply('Failed to load asset for ' + prop + ': ' + (err ? (err.message || err) : 'asset is null'));
      return;
    }
    comp[prop] = asset;
    event.reply(null, serializeComponent(comp));
  });
}

// ---- Exported Scene Script Methods ----

// Recursively increment all __id__ values in a serialized array by 1
function _incrementIds(arr) {
  for (var i = 0; i < arr.length; i++) {
    _incrementIdsInObj(arr[i]);
  }
}

function _incrementIdsInObj(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      _incrementIdsInObj(obj[i]);
    }
    return;
  }
  var keys = Object.keys(obj);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var val = obj[key];
    if (key === '__id__' && typeof val === 'number') {
      obj.__id__ = val + 1;
    } else if (val && typeof val === 'object') {
      _incrementIdsInObj(val);
    }
  }
}

module.exports = {

  // Serialize the current scene to JSON string (for direct file write)
  // Wraps with cc.SceneAsset to match .fire format expected by CC2
  serializeSceneToJson: function (event) {
    try {
      var scene = cc.director.getScene();
      if (!scene) throw new Error('No scene loaded');
      var data = Editor.serialize(scene);
      // Editor.serialize returns a JSON string of an array starting with cc.Scene
      // .fire format requires a cc.SceneAsset wrapper at index 0
      var arr = JSON.parse(data);
      if (!Array.isArray(arr)) throw new Error('Editor.serialize did not return a JSON array');
      // Increment all __id__ references by 1 (since we insert a new element at index 0)
      _incrementIds(arr);
      // Insert cc.SceneAsset at the beginning, pointing scene to __id__:1 (the original first element)
      arr.unshift({
        __type__: 'cc.SceneAsset',
        _name: '',
        _objFlags: 0,
        _native: '',
        scene: { __id__: 1 }
      });
      event.reply(null, JSON.stringify(arr, null, 2));
    } catch (e) {
      event.reply(e.message);
    }
  },

  // Stash the scene (serialize to internal buffer for save)
  stashScene: function (event) {
    try {
      _Scene.stashScene();
      event.reply(null, { success: true });
    } catch (e) {
      event.reply(e.message);
    }
  },

  // Diagnostics: check available serialization APIs
  diagnoseSaveApis: function (event) {
    try {
      var apis = {};
      apis.hasEditor = typeof Editor !== 'undefined';
      apis.has_Scene = typeof _Scene !== 'undefined';
      apis.has_cc_serialize = typeof cc.serialize === 'function';
      apis.has_cc_engine = typeof cc.engine !== 'undefined';
      apis.has_cc_loader = typeof cc.loader !== 'undefined';
      if (typeof _Scene !== 'undefined') {
        apis._Scene_keys = Object.keys(_Scene).slice(0, 30);
      }
      if (typeof Editor !== 'undefined') {
        apis.Editor_keys = Object.keys(Editor).slice(0, 30);
        apis.hasEditorSerialize = typeof Editor.serialize === 'function';
      }
      if (typeof cc.engine !== 'undefined') {
        apis.ccEngine_keys = Object.keys(cc.engine).slice(0, 30);
      }
      event.reply(null, apis);
    } catch (e) {
      event.reply(e.message);
    }
  },

  // Scene info
  getSceneTree: function (event, params) {
    try {
      var scene = getSceneRoot();
      var maxDepth = (params && params.maxDepth) || 99;
      var tree = serializeNode(scene, 0, maxDepth);
      event.reply(null, tree);
    } catch (e) {
      event.reply(e.message);
    }
  },

  getCurrentSceneInfo: function (event) {
    try {
      var scene = getSceneRoot();
      event.reply(null, {
        name: scene.name,
        uuid: scene.uuid,
        childCount: scene.children.length,
      });
    } catch (e) {
      event.reply(e.message);
    }
  },

  // Node read
  getNode: function (event, params) {
    try {
      var node = findNode(params);
      event.reply(null, serializeNode(node, 0, 1));
    } catch (e) {
      event.reply(e.message);
    }
  },

  getNodeChildren: function (event, params) {
    try {
      var node = findNode(params);
      var children = node.children.map(function (c) {
        return serializeNode(c, 0, 0);
      });
      event.reply(null, children);
    } catch (e) {
      event.reply(e.message);
    }
  },

  findNodes: function (event, params) {
    try {
      var scene = getSceneRoot();
      var pattern = params.pattern;
      var maxResults = params.maxResults || 50;
      var regex = new RegExp(pattern, 'i');
      var results = [];
      _walkNodes(scene, function (node) {
        if (results.length >= maxResults) return;
        if (regex.test(node.name)) {
          results.push(serializeNode(node, 0, 0));
        }
      });
      event.reply(null, results);
    } catch (e) {
      event.reply(e.message);
    }
  },

  // Node CRUD
  createNode: function (event, params) {
    try {
      var parent = params.parentPath ? cc.find(params.parentPath) : getSceneRoot();
      if (!parent) throw new Error('Parent not found: ' + params.parentPath);
      var node = new cc.Node(params.name || 'New Node');
      if (params.position) { node.x = params.position.x || 0; node.y = params.position.y || 0; }
      parent.addChild(node);
      event.reply(null, serializeNode(node, 0, 0));
    } catch (e) {
      event.reply(e.message);
    }
  },

  deleteNode: function (event, params) {
    try {
      var node = findNode(params);
      node.destroy();
      // Force immediate cleanup so the destroyed node is removed before any save
      cc.Object._deferredDestroy();
      event.reply(null, { success: true });
    } catch (e) {
      event.reply(e.message);
    }
  },

  setNodeProperty: function (event, params) {
    try {
      var node = findNode(params);
      var prop = params.property;
      var val = params.value;
      if (prop === 'position') { node.x = val.x; node.y = val.y; }
      else if (prop === 'scale') { node.scaleX = val.x; node.scaleY = val.y; }
      else if (prop === 'anchor') { node.anchorX = val.x; node.anchorY = val.y; }
      else if (prop === 'size') { node.width = val.width; node.height = val.height; }
      else if (prop === 'color') { node.color = new cc.Color(val.r, val.g, val.b, val.a); }
      else { node[prop] = val; }
      event.reply(null, serializeNode(node, 0, 0));
    } catch (e) {
      event.reply(e.message);
    }
  },

  moveNode: function (event, params) {
    try {
      var node = findNode({ path: params.sourcePath, uuid: params.sourceUuid });
      var newParent = cc.find(params.targetParentPath);
      if (!newParent) throw new Error('Target parent not found: ' + params.targetParentPath);
      node.removeFromParent(false);
      newParent.addChild(node);
      if (params.siblingIndex !== undefined) node.setSiblingIndex(params.siblingIndex);
      event.reply(null, serializeNode(node, 0, 0));
    } catch (e) {
      event.reply(e.message);
    }
  },

  duplicateNode: function (event, params) {
    try {
      var node = findNode(params);
      var clone = cc.instantiate(node);
      node.parent.addChild(clone);
      event.reply(null, serializeNode(clone, 0, 0));
    } catch (e) {
      event.reply(e.message);
    }
  },

  // Components
  getComponents: function (event, params) {
    try {
      var node = findNode(params);
      var comps = node._components.map(function (c) { return serializeComponent(c); });
      event.reply(null, comps);
    } catch (e) {
      event.reply(e.message);
    }
  },

  getComponent: function (event, params) {
    try {
      var node = findNode(params);
      var comp = node.getComponent(params.componentType);
      if (!comp) throw new Error('Component not found: ' + params.componentType);
      event.reply(null, serializeComponent(comp));
    } catch (e) {
      event.reply(e.message);
    }
  },

  addComponent: function (event, params) {
    try {
      var node = findNode(params);
      var comp = node.addComponent(params.componentType);
      event.reply(null, serializeComponent(comp));
    } catch (e) {
      event.reply(e.message);
    }
  },

  removeComponent: function (event, params) {
    try {
      var node = findNode(params);
      var comp = node.getComponent(params.componentType);
      if (!comp) throw new Error('Component not found: ' + params.componentType);
      comp.destroy();
      // Force immediate cleanup so getComponents reflects the removal
      cc.Object._deferredDestroy();
      event.reply(null, { success: true });
    } catch (e) {
      event.reply(e.message);
    }
  },

  setComponentProperty: function (event, params) {
    try {
      var node = findNode(params);
      var comp = node.getComponent(params.componentType);
      if (!comp) throw new Error('Component not found: ' + params.componentType);

      var prop = params.property;
      var val = params.value;

      // Asset-reference properties: must load the actual asset, NEVER assign raw UUID/object
      if (ASSET_PROPS[prop]) {
        // Allow clearing with null
        if (val === null || val === undefined) {
          comp[prop] = null;
          event.reply(null, serializeComponent(comp));
          return;
        }
        var uuid = extractUuid(val);
        if (uuid) {
          loadAndSetAssetProperty(comp, prop, uuid, event);
          return; // async path
        }
        // Not a UUID — reject to prevent scene corruption
        event.reply('Property "' + prop + '" requires a UUID string or {uuid: "..."} object, got: ' + typeof val);
        return;
      }

      comp[prop] = val;
      event.reply(null, serializeComponent(comp));
    } catch (e) {
      event.reply(e.message);
    }
  },
};

// ---- Walk helper ----

function _walkNodes(node, cb) {
  cb(node);
  for (var i = 0; i < node.children.length; i++) {
    _walkNodes(node.children[i], cb);
  }
}