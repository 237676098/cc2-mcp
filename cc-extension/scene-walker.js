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
  var keys = Object.keys(comp);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key.startsWith('_') || key === 'node' || key === 'uuid' || key === 'enabled') continue;
    try {
      result.properties[key] = serializer.safeSerialize(comp[key], 3);
    } catch (e) { /* skip */ }
  }
  return result;
}

// ---- Exported Scene Script Methods ----

module.exports = {

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
      comp[params.property] = params.value;
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