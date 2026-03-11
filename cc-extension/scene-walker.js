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
    rotation: -node.angle,
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
  var skipSet = {
    node: 1, uuid: 1, enabled: 1, constructor: 1,
    // Sprite deprecated inset properties (property + obsolete get/set method wrappers)
    insetBottom: 1, insetLeft: 1, insetRight: 1, insetTop: 1,
    setInsetBottom: 1, setInsetLeft: 1, setInsetRight: 1, setInsetTop: 1,
    getInsetBottom: 1, getInsetLeft: 1, getInsetRight: 1, getInsetTop: 1,
    // deprecated materials accessor
    sharedMaterials: 1,
    // Widget deprecated property
    isAlignOnce: 1
  };
  for (var key in allKeys) {
    if (key.startsWith('_') || skipSet[key]) continue;
    try {
      result.properties[key] = serializer.safeSerialize(comp[key], 3);
    } catch (e) { /* skip */ }
  }
  return result;
}

// ---- Spine helper ----

function getSpineSkeleton(params) {
  if (typeof sp === 'undefined') throw new Error('sp (spine) module not available');
  var node = findNode(params);
  var skeleton = node.getComponent(sp.Skeleton);
  if (!skeleton) throw new Error('No sp.Skeleton component on node');
  return skeleton;
}

// ---- UI helper ----

function getOrAddComponent(node, typeName, addIfMissing) {
  var comp = node.getComponent(typeName);
  if (!comp) {
    if (addIfMissing) {
      comp = node.addComponent(typeName);
      if (!comp) {
        var existing = node._components.map(function(c) { return cc.js.getClassName(c); });
        throw new Error('Cannot add component "' + typeName + '" to node "' + node.name +
          '". Conflicts with existing components: [' + existing.join(', ') + '].');
      }
    } else {
      throw new Error('No ' + typeName + ' component. Set addIfMissing=true to auto-add.');
    }
  }
  return comp;
}

// ---- Spine property setter (non-asset props) ----

function _applySpineProps(skeleton, props) {
  if (props.defaultSkin !== undefined) skeleton.defaultSkin = props.defaultSkin;
  if (props.defaultAnimation !== undefined) skeleton.defaultAnimation = props.defaultAnimation;
  if (props.animation !== undefined) skeleton.animation = props.animation;
  if (props.loop !== undefined) skeleton.loop = props.loop;
  if (props.premultipliedAlpha !== undefined) skeleton.premultipliedAlpha = props.premultipliedAlpha;
  if (props.timeScale !== undefined) skeleton.timeScale = props.timeScale;
  if (props.paused !== undefined) skeleton.paused = props.paused;
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
      else if (prop === 'rotation') { node.angle = -val; }
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
      if (!comp) {
        // CC2 addComponent returns null on conflict (e.g. Label + Sprite both derive from RenderComponent)
        // The real error is only logged to cc.error console, so we provide a clear message back
        var existing = node._components.map(function(c) { return cc.js.getClassName(c); });
        event.reply('Cannot add component "' + params.componentType + '" to node "' + node.name +
          '". It may conflict with existing components: [' + existing.join(', ') + ']. ' +
          'In CC2, components derived from the same base (e.g. cc.Sprite and cc.Label both extend cc.RenderComponent) cannot coexist on the same node.');
        return;
      }
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

  // ---- Animation methods ----

  getNodeAnimations: function (event, params) {
    try {
      var node = findNode(params);
      var anim = node.getComponent(cc.Animation);
      if (!anim) throw new Error('No Animation component on node');
      var clips = anim._clips || [];
      var clipInfos = clips.map(function (clip) {
        if (!clip) return null;
        return { name: clip.name, duration: clip.duration, wrapMode: clip.wrapMode, speed: clip.speed };
      }).filter(Boolean);
      var defaultClip = anim.defaultClip;
      event.reply(null, {
        clips: clipInfos,
        defaultClip: defaultClip ? defaultClip.name : null,
        playOnLoad: anim.playOnLoad,
        currentClip: anim.currentClip ? anim.currentClip.name : null,
      });
    } catch (e) {
      event.reply(e.message);
    }
  },

  setNodeAnimationClip: function (event, params) {
    try {
      var node = findNode(params);
      var anim = node.getComponent(cc.Animation);
      if (!anim) throw new Error('No Animation component on node');
      var action = params.action;
      var clipUuid = params.clipUuid;
      cc.assetManager.loadAny({ uuid: clipUuid }, function (err, clip) {
        if (err || !clip) {
          event.reply('Failed to load animation clip: ' + (err ? (err.message || err) : 'clip is null'));
          return;
        }
        try {
          if (action === 'add') {
            anim.addClip(clip);
          } else if (action === 'remove') {
            anim.removeClip(clip, true);
          } else if (action === 'setDefault') {
            // Ensure clip is added first
            var existing = anim._clips.indexOf(clip);
            if (existing < 0) anim.addClip(clip);
            anim.defaultClip = clip;
          }
          var clips = (anim._clips || []).map(function (c) {
            if (!c) return null;
            return { name: c.name, duration: c.duration };
          }).filter(Boolean);
          event.reply(null, {
            success: true,
            clips: clips,
            defaultClip: anim.defaultClip ? anim.defaultClip.name : null,
          });
        } catch (e2) {
          event.reply(e2.message);
        }
      });
    } catch (e) {
      event.reply(e.message);
    }
  },

  playAnimation: function (event, params) {
    try {
      var node = findNode(params);
      var anim = node.getComponent(cc.Animation);
      if (!anim) throw new Error('No Animation component on node');
      var action = params.action;
      if (action === 'play') {
        var state = params.clipName ? anim.play(params.clipName) : anim.play();
        event.reply(null, { success: true, clip: state ? state.name : null });
      } else if (action === 'stop') {
        anim.stop();
        event.reply(null, { success: true });
      } else if (action === 'pause') {
        anim.pause();
        event.reply(null, { success: true });
      } else if (action === 'resume') {
        anim.resume();
        event.reply(null, { success: true });
      } else {
        event.reply('Unknown animation action: ' + action);
      }
    } catch (e) {
      event.reply(e.message);
    }
  },

  // ---- Prefab methods ----

  instantiatePrefab: function (event, params) {
    try {
      var prefabUuid = params.prefabUuid;
      if (!prefabUuid) throw new Error('prefabUuid required');
      cc.assetManager.loadAny({ uuid: prefabUuid }, function (err, prefab) {
        if (err || !prefab) {
          event.reply('Failed to load prefab: ' + (err ? (err.message || err) : 'prefab is null'));
          return;
        }
        try {
          var node = cc.instantiate(prefab);
          var parent;
          if (params.parentPath) {
            parent = cc.find(params.parentPath);
            if (!parent) throw new Error('Parent not found: ' + params.parentPath);
          } else {
            parent = getSceneRoot();
          }
          if (params.position) {
            node.x = params.position.x || 0;
            node.y = params.position.y || 0;
          }
          parent.addChild(node);
          event.reply(null, serializeNode(node, 0, 1));
        } catch (e2) {
          event.reply(e2.message);
        }
      });
    } catch (e) {
      event.reply(e.message);
    }
  },

  serializeNodeToPrefab: function (event, params) {
    try {
      var node = findNode(params);
      var data = Editor.serialize(node);
      // Editor.serialize returns a JSON string of an array starting with cc.Node
      // Prefab format requires a cc.Prefab wrapper at index 0
      var arr = JSON.parse(data);
      if (!Array.isArray(arr)) throw new Error('Editor.serialize did not return a JSON array');
      // Increment all __id__ references by 1 (since we insert a new element at index 0)
      _incrementIds(arr);
      // Insert cc.Prefab wrapper at the beginning
      arr.unshift({
        __type__: 'cc.Prefab',
        _name: node.name,
        _objFlags: 0,
        _native: '',
        data: { __id__: 1 },
        optimizationPolicy: 0,
        asyncLoadAssets: false,
      });
      event.reply(null, { json: JSON.stringify(arr, null, 2) });
    } catch (e) {
      event.reply(e.message);
    }
  },

  getPrefabStatus: function (event, params) {
    try {
      var node = findNode(params);
      var prefabInfo = node._prefab;
      if (!prefabInfo) {
        event.reply(null, { isPrefab: false });
        return;
      }
      var result = {
        isPrefab: true,
        fileId: prefabInfo.fileId || null,
        sync: prefabInfo.sync || false,
      };
      if (prefabInfo.asset) {
        result.assetUuid = prefabInfo.asset._uuid || prefabInfo.asset.uuid || null;
      }
      if (prefabInfo.root) {
        result.rootNodeUuid = prefabInfo.root.uuid || null;
        result.rootNodeName = prefabInfo.root.name || null;
      }
      event.reply(null, result);
    } catch (e) {
      event.reply(e.message);
    }
  },

  // ---- Spine methods ----

  getSpineInfo: function (event, params) {
    try {
      var skeleton = getSpineSkeleton(params);
      var skData = skeleton.skeletonData;
      event.reply(null, {
        hasSkeletonData: !!skData,
        skeletonDataName: skData ? (skData.name || skData._name || null) : null,
        skeletonDataUuid: skData ? (skData._uuid || null) : null,
        defaultSkin: skeleton.defaultSkin || null,
        defaultAnimation: skeleton.defaultAnimation || null,
        animation: skeleton.animation || null,
        loop: skeleton.loop,
        premultipliedAlpha: skeleton.premultipliedAlpha,
        timeScale: skeleton.timeScale,
        paused: skeleton.paused,
      });
    } catch (e) {
      event.reply(e.message);
    }
  },

  setSpineProperty: function (event, params) {
    try {
      var skeleton = getSpineSkeleton(params);
      var props = params.properties || {};
      var needAsync = false;

      // Handle skeletonData (asset reference) separately
      if (props.skeletonData !== undefined) {
        var uuid = extractUuid(props.skeletonData);
        if (uuid) {
          needAsync = true;
          cc.assetManager.loadAny({ uuid: uuid }, function (err, asset) {
            if (err || !asset) {
              event.reply('Failed to load skeletonData: ' + (err ? (err.message || err) : 'asset is null'));
              return;
            }
            skeleton.skeletonData = asset;
            // Set remaining props after async load
            _applySpineProps(skeleton, props);
            event.reply(null, { success: true });
          });
        } else if (props.skeletonData === null) {
          skeleton.skeletonData = null;
        }
      }

      if (!needAsync) {
        _applySpineProps(skeleton, props);
        event.reply(null, { success: true });
      }
    } catch (e) {
      event.reply(e.message);
    }
  },

  spineSetAnimation: function (event, params) {
    try {
      var skeleton = getSpineSkeleton(params);
      var track = params.track !== undefined ? params.track : 0;
      var name = params.name;
      var loop = params.loop !== undefined ? params.loop : false;
      if (!name) throw new Error('Animation name is required');
      skeleton.setAnimation(track, name, loop);
      event.reply(null, { success: true, track: track, animation: name, loop: loop });
    } catch (e) {
      event.reply(e.message);
    }
  },

  spineAddAnimation: function (event, params) {
    try {
      var skeleton = getSpineSkeleton(params);
      var track = params.track !== undefined ? params.track : 0;
      var name = params.name;
      var loop = params.loop !== undefined ? params.loop : false;
      var delay = params.delay !== undefined ? params.delay : 0;
      if (!name) throw new Error('Animation name is required');
      skeleton.addAnimation(track, name, loop, delay);
      event.reply(null, { success: true, track: track, animation: name, loop: loop, delay: delay });
    } catch (e) {
      event.reply(e.message);
    }
  },

  spineSetSkin: function (event, params) {
    try {
      var skeleton = getSpineSkeleton(params);
      var skinName = params.skinName;
      if (!skinName) throw new Error('skinName is required');
      skeleton.setSkin(skinName);
      event.reply(null, { success: true, skin: skinName });
    } catch (e) {
      event.reply(e.message);
    }
  },

  getSpineBones: function (event, params) {
    try {
      var skeleton = getSpineSkeleton(params);
      var spSkeleton = skeleton._skeleton;
      if (!spSkeleton) throw new Error('Spine skeleton not initialized (no skeletonData?)');
      var bones = spSkeleton.bones || [];
      var result = bones.map(function (bone) {
        return {
          name: bone.data ? bone.data.name : (bone.name || null),
          parent: bone.parent ? (bone.parent.data ? bone.parent.data.name : null) : null,
          x: bone.x,
          y: bone.y,
          rotation: bone.rotation,
          scaleX: bone.scaleX,
          scaleY: bone.scaleY,
        };
      });
      event.reply(null, result);
    } catch (e) {
      event.reply(e.message);
    }
  },

  getSpineSlots: function (event, params) {
    try {
      var skeleton = getSpineSkeleton(params);
      var spSkeleton = skeleton._skeleton;
      if (!spSkeleton) throw new Error('Spine skeleton not initialized (no skeletonData?)');
      var slots = spSkeleton.slots || [];
      var result = slots.map(function (slot) {
        return {
          name: slot.data ? slot.data.name : (slot.name || null),
          bone: slot.bone ? (slot.bone.data ? slot.bone.data.name : null) : null,
          attachment: slot.attachment ? slot.attachment.name : null,
        };
      });
      event.reply(null, result);
    } catch (e) {
      event.reply(e.message);
    }
  },

  getSpineAnimations: function (event, params) {
    try {
      var skeleton = getSpineSkeleton(params);
      var spSkeleton = skeleton._skeleton;
      if (!spSkeleton || !spSkeleton.data) throw new Error('Spine skeleton not initialized (no skeletonData?)');
      var animations = spSkeleton.data.animations || [];
      var result = animations.map(function (anim) {
        return { name: anim.name, duration: anim.duration };
      });
      event.reply(null, result);
    } catch (e) {
      event.reply(e.message);
    }
  },

  getSpineSkins: function (event, params) {
    try {
      var skeleton = getSpineSkeleton(params);
      var spSkeleton = skeleton._skeleton;
      if (!spSkeleton || !spSkeleton.data) throw new Error('Spine skeleton not initialized (no skeletonData?)');
      var skins = spSkeleton.data.skins || [];
      var result = skins.map(function (skin) {
        return { name: skin.name };
      });
      event.reply(null, result);
    } catch (e) {
      event.reply(e.message);
    }
  },

  // ---- UI component setup methods ----

  setupButton: function (event, params) {
    try {
      var node = findNode(params);
      var btn = getOrAddComponent(node, cc.Button, params.addIfMissing);
      var p = params.properties || {};
      if (p.transition !== undefined) btn.transition = p.transition;
      if (p.normalColor) btn.normalColor = new cc.Color(p.normalColor.r, p.normalColor.g, p.normalColor.b, p.normalColor.a !== undefined ? p.normalColor.a : 255);
      if (p.pressedColor) btn.pressedColor = new cc.Color(p.pressedColor.r, p.pressedColor.g, p.pressedColor.b, p.pressedColor.a !== undefined ? p.pressedColor.a : 255);
      if (p.hoverColor) btn.hoverColor = new cc.Color(p.hoverColor.r, p.hoverColor.g, p.hoverColor.b, p.hoverColor.a !== undefined ? p.hoverColor.a : 255);
      if (p.disabledColor) btn.disabledColor = new cc.Color(p.disabledColor.r, p.disabledColor.g, p.disabledColor.b, p.disabledColor.a !== undefined ? p.disabledColor.a : 255);
      if (p.duration !== undefined) btn.duration = p.duration;
      if (p.zoomScale !== undefined) btn.zoomScale = p.zoomScale;
      if (p.interactable !== undefined) btn.interactable = p.interactable;
      event.reply(null, serializeComponent(btn));
    } catch (e) {
      event.reply(e.message);
    }
  },

  setupEditBox: function (event, params) {
    try {
      var node = findNode(params);
      var eb = getOrAddComponent(node, cc.EditBox, params.addIfMissing);
      var p = params.properties || {};
      if (p.string !== undefined) eb.string = p.string;
      if (p.placeholder !== undefined) eb.placeholder = p.placeholder;
      if (p.maxLength !== undefined) eb.maxLength = p.maxLength;
      if (p.inputFlag !== undefined) eb.inputFlag = p.inputFlag;
      if (p.inputMode !== undefined) eb.inputMode = p.inputMode;
      if (p.fontSize !== undefined) eb.fontSize = p.fontSize;
      if (p.fontColor !== undefined) eb.fontColor = new cc.Color(p.fontColor.r, p.fontColor.g, p.fontColor.b, p.fontColor.a !== undefined ? p.fontColor.a : 255);
      if (p.returnType !== undefined) eb.returnType = p.returnType;
      event.reply(null, serializeComponent(eb));
    } catch (e) {
      event.reply(e.message);
    }
  },

  setupScrollView: function (event, params) {
    try {
      var node = findNode(params);
      var sv = getOrAddComponent(node, cc.ScrollView, params.addIfMissing);
      var p = params.properties || {};
      if (p.horizontal !== undefined) sv.horizontal = p.horizontal;
      if (p.vertical !== undefined) sv.vertical = p.vertical;
      if (p.inertia !== undefined) sv.inertia = p.inertia;
      if (p.elastic !== undefined) sv.elastic = p.elastic;
      if (p.brake !== undefined) sv.brake = p.brake;
      if (p.bounceDuration !== undefined) sv.bounceDuration = p.bounceDuration;
      event.reply(null, serializeComponent(sv));
    } catch (e) {
      event.reply(e.message);
    }
  },

  setupLayout: function (event, params) {
    try {
      var node = findNode(params);
      var layout = getOrAddComponent(node, cc.Layout, params.addIfMissing);
      var p = params.properties || {};
      if (p.type !== undefined) layout.type = p.type;
      if (p.resizeMode !== undefined) layout.resizeMode = p.resizeMode;
      if (p.spacingX !== undefined) layout.spacingX = p.spacingX;
      if (p.spacingY !== undefined) layout.spacingY = p.spacingY;
      if (p.paddingLeft !== undefined) layout.paddingLeft = p.paddingLeft;
      if (p.paddingRight !== undefined) layout.paddingRight = p.paddingRight;
      if (p.paddingTop !== undefined) layout.paddingTop = p.paddingTop;
      if (p.paddingBottom !== undefined) layout.paddingBottom = p.paddingBottom;
      if (p.cellSize !== undefined && p.cellSize) layout.cellSize = new cc.Size(p.cellSize.width, p.cellSize.height);
      if (p.startAxis !== undefined) layout.startAxis = p.startAxis;
      if (p.verticalDirection !== undefined) layout.verticalDirection = p.verticalDirection;
      if (p.horizontalDirection !== undefined) layout.horizontalDirection = p.horizontalDirection;
      if (p.affectedByScale !== undefined) layout.affectedByScale = p.affectedByScale;
      if (typeof layout.updateLayout === 'function') layout.updateLayout();
      event.reply(null, serializeComponent(layout));
    } catch (e) {
      event.reply(e.message);
    }
  },

  setupToggle: function (event, params) {
    try {
      var node = findNode(params);
      var toggle = getOrAddComponent(node, cc.Toggle, params.addIfMissing);
      var p = params.properties || {};
      if (p.isChecked !== undefined) toggle.isChecked = p.isChecked;
      if (p.interactable !== undefined) toggle.interactable = p.interactable;
      event.reply(null, serializeComponent(toggle));
    } catch (e) {
      event.reply(e.message);
    }
  },

  setupSlider: function (event, params) {
    try {
      var node = findNode(params);
      var slider = getOrAddComponent(node, cc.Slider, params.addIfMissing);
      var p = params.properties || {};
      if (p.direction !== undefined) slider.direction = p.direction;
      if (p.progress !== undefined) slider.progress = p.progress;
      event.reply(null, serializeComponent(slider));
    } catch (e) {
      event.reply(e.message);
    }
  },

  setupProgressBar: function (event, params) {
    try {
      var node = findNode(params);
      var bar = getOrAddComponent(node, cc.ProgressBar, params.addIfMissing);
      var p = params.properties || {};
      if (p.mode !== undefined) bar.mode = p.mode;
      if (p.progress !== undefined) bar.progress = p.progress;
      if (p.totalLength !== undefined) bar.totalLength = p.totalLength;
      if (p.reverse !== undefined) bar.reverse = p.reverse;
      event.reply(null, serializeComponent(bar));
    } catch (e) {
      event.reply(e.message);
    }
  },

  setupRichText: function (event, params) {
    try {
      var node = findNode(params);
      var rt = getOrAddComponent(node, cc.RichText, params.addIfMissing);
      var p = params.properties || {};
      if (p.string !== undefined) rt.string = p.string;
      if (p.fontSize !== undefined) rt.fontSize = p.fontSize;
      if (p.maxWidth !== undefined) rt.maxWidth = p.maxWidth;
      if (p.lineHeight !== undefined) rt.lineHeight = p.lineHeight;
      if (p.horizontalAlign !== undefined) rt.horizontalAlign = p.horizontalAlign;
      if (p.handleTouchEvent !== undefined) rt.handleTouchEvent = p.handleTouchEvent;
      event.reply(null, serializeComponent(rt));
    } catch (e) {
      event.reply(e.message);
    }
  },

  setupWidget: function (event, params) {
    try {
      var node = findNode(params);
      var widget = getOrAddComponent(node, cc.Widget, params.addIfMissing);
      var p = params.properties || {};
      if (p.isAlignTop !== undefined) widget.isAlignTop = p.isAlignTop;
      if (p.isAlignBottom !== undefined) widget.isAlignBottom = p.isAlignBottom;
      if (p.isAlignLeft !== undefined) widget.isAlignLeft = p.isAlignLeft;
      if (p.isAlignRight !== undefined) widget.isAlignRight = p.isAlignRight;
      if (p.isAlignHorizontalCenter !== undefined) widget.isAlignHorizontalCenter = p.isAlignHorizontalCenter;
      if (p.isAlignVerticalCenter !== undefined) widget.isAlignVerticalCenter = p.isAlignVerticalCenter;
      if (p.top !== undefined) widget.top = p.top;
      if (p.bottom !== undefined) widget.bottom = p.bottom;
      if (p.left !== undefined) widget.left = p.left;
      if (p.right !== undefined) widget.right = p.right;
      if (p.horizontalCenter !== undefined) widget.horizontalCenter = p.horizontalCenter;
      if (p.verticalCenter !== undefined) widget.verticalCenter = p.verticalCenter;
      // isAlignOnce is deprecated — convert to alignMode
      if (p.isAlignOnce !== undefined) widget.alignMode = p.isAlignOnce ? cc.Widget.AlignMode.ONCE : cc.Widget.AlignMode.ALWAYS;
      if (p.alignMode !== undefined) widget.alignMode = p.alignMode;
      widget.updateAlignment();
      event.reply(null, serializeComponent(widget));
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