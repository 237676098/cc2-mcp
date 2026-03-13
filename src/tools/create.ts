import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeClient } from '../bridge/client.js';

export function registerCreateTools(server: McpServer, bridge: BridgeClient) {
  // TypeScript 组件创建工具
  server.tool(
    'cc_create_typescript_component',
    'Create a new TypeScript component script with correct CC2 decorator boilerplate',
    {
      path: z.string().describe('Asset URL, e.g. db://assets/scripts/PlayerController.ts'),
      className: z.string().describe('Class name, e.g. PlayerController'),
      properties: z.array(z.object({
        name: z.string().describe('Property name'),
        type: z.string().describe('CC type string, e.g. cc.Label, cc.Node, cc.Integer, cc.Float, cc.String'),
        default: z.any().optional().describe('Default value (auto-inferred if omitted)'),
        isArray: z.boolean().optional().describe('Array property'),
      })).optional().describe('Component properties'),
      lifecycles: z.array(z.enum(['onLoad', 'start', 'update', 'lateUpdate', 'onDestroy', 'onEnable', 'onDisable']))
        .optional().describe('Lifecycle methods (default: [start])'),
      body: z.string().optional().describe('Additional class body code'),
    },
    async ({ path, className, properties, lifecycles, body }) => {
      const content = buildTsComponent(className, properties || [], lifecycles || ['start'], body);
      const data = await bridge.send('asset', 'createAsset', { url: path, content });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 场景创建工具
  server.tool(
    'cc_create_scene',
    'Create a new .fire scene file with valid minimal structure',
    {
      path: z.string().describe('Asset URL, e.g. db://assets/scenes/game.fire'),
      name: z.string().optional().describe('Scene name (defaults to filename)'),
      withCanvas: z.boolean().optional().describe('Include Canvas node (default: true)'),
      canvasDesignResolution: z.object({
        width: z.number(),
        height: z.number(),
      }).optional().describe('Design resolution (default: 960x640)'),
      withCamera: z.boolean().optional().describe('Include Main Camera (default: true)'),
      backgroundColor: z.object({
        r: z.number(),
        g: z.number(),
        b: z.number(),
        a: z.number().optional(),
      }).optional().describe('Camera background color'),
    },
    async ({ path, name, withCanvas, canvasDesignResolution, withCamera, backgroundColor }) => {
      const sceneName = name || path.split('/').pop()?.replace('.fire', '') || 'NewScene';
      const bgColor = backgroundColor || { r: 0, g: 0, b: 0, a: 255 };
      const content = buildScene(sceneName, {
        withCanvas: withCanvas ?? true,
        canvasDesignResolution: canvasDesignResolution || { width: 960, height: 640 },
        withCamera: withCamera ?? true,
        backgroundColor: { r: bgColor.r, g: bgColor.g, b: bgColor.b, a: bgColor.a ?? 255 },
      });
      const data = await bridge.send('asset', 'createAsset', { url: path, content });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}

// TypeScript 组件模板构建
function buildTsComponent(
  className: string,
  properties: Array<{ name: string; type: string; default?: any; isArray?: boolean }>,
  lifecycles: string[],
  body?: string
): string {
  let code = `const {ccclass, property} = cc._decorator;\n\n`;
  code += `@ccclass\nexport default class ${className} extends cc.Component {\n`;

  // 属性
  for (const prop of properties) {
    const { name, type, isArray } = prop;
    let defaultVal = prop.default;

    if (isArray) {
      code += `    @property([${type}])\n`;
      code += `    ${name}: ${type}[] = [];\n\n`;
    } else if (type === 'cc.Integer' || type === 'cc.Float') {
      code += `    @property({ type: ${type} })\n`;
      if (defaultVal === undefined) defaultVal = 0;
      code += `    ${name}: number = ${defaultVal};\n\n`;
    } else if (type === 'cc.String') {
      code += `    @property\n`;
      if (defaultVal === undefined) defaultVal = "''";
      code += `    ${name}: string = ${defaultVal};\n\n`;
    } else if (type === 'cc.Boolean') {
      code += `    @property\n`;
      if (defaultVal === undefined) defaultVal = false;
      code += `    ${name}: boolean = ${defaultVal};\n\n`;
    } else {
      code += `    @property(${type})\n`;
      if (defaultVal === undefined) defaultVal = 'null';
      code += `    ${name}: ${type} = ${defaultVal};\n\n`;
    }
  }

  // 生命周期
  for (const lifecycle of lifecycles) {
    if (lifecycle === 'update') {
      code += `    ${lifecycle}(dt: number) {\n    }\n\n`;
    } else if (lifecycle === 'lateUpdate') {
      code += `    ${lifecycle}(dt: number) {\n    }\n\n`;
    } else {
      code += `    ${lifecycle}() {\n    }\n\n`;
    }
  }

  // 额外代码
  if (body) {
    code += `    ${body}\n`;
  }

  code += `}\n`;
  return code;
}

// 场景模板构建
function buildScene(
  name: string,
  options: {
    withCanvas: boolean;
    canvasDesignResolution: { width: number; height: number };
    withCamera: boolean;
    backgroundColor: { r: number; g: number; b: number; a: number };
  }
): string {
  const scene: any[] = [];
  let idCounter = 0;

  // [0] SceneAsset
  scene.push({
    __type__: 'cc.SceneAsset',
    _name: '',
    _objFlags: 0,
    _native: '',
    scene: { __id__: 1 },
  });

  // [1] Scene
  const sceneChildren = options.withCanvas ? [{ __id__: 2 }] : [];
  scene.push({
    __type__: 'cc.Scene',
    _objFlags: 0,
    _parent: null,
    _children: sceneChildren,
    _active: false,
    _components: [],
    _prefab: null,
    _opacity: 255,
    _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
    _contentSize: { __type__: 'cc.Size', width: 0, height: 0 },
    _anchorPoint: { __type__: 'cc.Vec2', x: 0, y: 0 },
    _trs: {
      __type__: 'TypedArray',
      ctor: 'Float64Array',
      array: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    },
    _zIndex: 0,
    _is3DNode: true,
    _groupIndex: 0,
    groupIndex: 0,
    autoReleaseAssets: false,
    _id: generateId(),
  });

  if (options.withCanvas) {
    const canvasChildren = options.withCamera ? [{ __id__: 3 }] : [];
    const { width, height } = options.canvasDesignResolution;

    // [2] Canvas Node
    scene.push({
      __type__: 'cc.Node',
      _name: 'Canvas',
      _objFlags: 0,
      _parent: { __id__: 1 },
      _children: canvasChildren,
      _active: true,
      _components: [{ __id__: 4 }],
      _prefab: null,
      _opacity: 255,
      _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
      _contentSize: { __type__: 'cc.Size', width, height },
      _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
      _trs: {
        __type__: 'TypedArray',
        ctor: 'Float64Array',
        array: [width / 2, height / 2, 0, 0, 0, 0, 1, 1, 1, 1],
      },
      _eulerAngles: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
      _skewX: 0,
      _skewY: 0,
      _zIndex: 0,
      _is3DNode: false,
      _groupIndex: 0,
      groupIndex: 0,
      _id: generateId(),
    });

    if (options.withCamera) {
      // [3] Main Camera Node
      scene.push({
        __type__: 'cc.Node',
        _name: 'Main Camera',
        _objFlags: 0,
        _parent: { __id__: 2 },
        _children: [],
        _active: true,
        _components: [{ __id__: 5 }],
        _prefab: null,
        _opacity: 255,
        _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
        _contentSize: { __type__: 'cc.Size', width: 0, height: 0 },
        _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
        _trs: {
          __type__: 'TypedArray',
          ctor: 'Float64Array',
          array: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
        },
        _eulerAngles: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
        _skewX: 0,
        _skewY: 0,
        _zIndex: 0,
        _is3DNode: false,
        _groupIndex: 0,
        groupIndex: 0,
        _id: generateId(),
      });
    }

    // [4] Canvas Component
    scene.push({
      __type__: 'cc.Canvas',
      _name: '',
      _objFlags: 0,
      node: { __id__: 2 },
      _enabled: true,
      _designResolution: { __type__: 'cc.Size', width, height },
      _fitWidth: false,
      _fitHeight: true,
      _id: generateId(),
    });

    if (options.withCamera) {
      const { r, g, b, a } = options.backgroundColor;
      // [5] Camera Component
      scene.push({
        __type__: 'cc.Camera',
        _name: '',
        _objFlags: 0,
        node: { __id__: 3 },
        _enabled: true,
        _cullingMask: 4294967295,
        _clearFlags: 7,
        _backgroundColor: { __type__: 'cc.Color', r, g, b, a },
        _depth: -1,
        _zoomRatio: 1,
        _targetTexture: null,
        _fov: 60,
        _orthoSize: 10,
        _nearClip: 1,
        _farClip: 4096,
        _ortho: true,
        _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
        _renderStages: 1,
        _alignWithScreen: true,
        _id: generateId(),
      });
    }
  }

  return JSON.stringify(scene, null, 2);
}

function generateId(): string {
  return `${Math.random().toString(36).substr(2, 9)}-${Date.now().toString(36)}`;
}
