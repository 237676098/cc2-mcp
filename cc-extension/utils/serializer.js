/**
 * Safe serializer for Cocos Creator objects.
 * Handles circular references and extracts only plain data properties.
 */

'use strict';

function safeSerialize(obj, maxDepth) {
  if (maxDepth === undefined) maxDepth = 10;
  var seen = new WeakSet();

  function _serialize(val, depth) {
    if (depth > maxDepth) return '[max depth]';
    if (val === null || val === undefined) return val;

    var type = typeof val;
    if (type === 'number' || type === 'string' || type === 'boolean') return val;
    if (type === 'function') return undefined;

    if (Array.isArray(val)) {
      if (seen.has(val)) return '[circular]';
      seen.add(val);
      var arr = [];
      for (var i = 0; i < val.length; i++) {
        arr.push(_serialize(val[i], depth + 1));
      }
      seen.delete(val);
      return arr;
    }

    if (type === 'object') {
      if (seen.has(val)) return '[circular]';
      seen.add(val);

      // Handle cc.Vec2, cc.Vec3, cc.Size, cc.Color, cc.Rect
      if (val.constructor) {
        var name = val.constructor.name;
        if (name === 'Vec2') return { x: val.x, y: val.y };
        if (name === 'Vec3') return { x: val.x, y: val.y, z: val.z };
        if (name === 'Size') return { width: val.width, height: val.height };
        if (name === 'Rect') return { x: val.x, y: val.y, width: val.width, height: val.height };
        if (name === 'Color') return { r: val.r, g: val.g, b: val.b, a: val.a };
      }

      var result = {};
      var keys = Object.keys(val);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        // Skip private/internal properties
        if (key.startsWith('_') && key !== '_name' && key !== '_id') continue;
        try {
          var v = _serialize(val[key], depth + 1);
          if (v !== undefined) result[key] = v;
        } catch (e) {
          // skip unreadable properties
        }
      }
      seen.delete(val);
      return result;
    }

    return undefined;
  }

  return _serialize(obj, 0);
}

module.exports = { safeSerialize: safeSerialize };
