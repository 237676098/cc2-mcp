import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeClient } from '../bridge/client.js';

const nodeRef = {
  path: z.string().optional().describe('Node path (e.g. Canvas/myButton)'),
  uuid: z.string().optional().describe('Node UUID'),
};

const colorSchema = z.object({
  r: z.number(), g: z.number(), b: z.number(),
  a: z.number().optional().describe('Alpha (default: 255)'),
}).optional();

export function registerUITools(server: McpServer, bridge: BridgeClient) {
  server.tool(
    'cc_setup_button',
    'Configure cc.Button: transition, colors, zoomScale, interactable (batch setter)',
    {
      ...nodeRef,
      addIfMissing: z.boolean().optional().describe('Auto-add component if not present'),
      properties: z.object({
        transition: z.number().optional().describe('0=NONE, 1=COLOR, 2=SPRITE, 3=SCALE'),
        normalColor: colorSchema.describe('Normal state color'),
        pressedColor: colorSchema.describe('Pressed state color'),
        hoverColor: colorSchema.describe('Hover state color'),
        disabledColor: colorSchema.describe('Disabled state color'),
        duration: z.number().optional().describe('Transition duration'),
        zoomScale: z.number().optional().describe('Scale on press (for SCALE transition)'),
        interactable: z.boolean().optional().describe('Is button interactable'),
      }).describe('Button properties to set'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setupButton', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_setup_editbox',
    'Configure cc.EditBox: string, placeholder, maxLength, inputMode, fontSize, fontColor (batch setter)',
    {
      ...nodeRef,
      addIfMissing: z.boolean().optional().describe('Auto-add component if not present'),
      properties: z.object({
        string: z.string().optional().describe('Current text content'),
        placeholder: z.string().optional().describe('Placeholder text'),
        maxLength: z.number().optional().describe('Max input length (-1 for unlimited)'),
        inputFlag: z.number().optional().describe('0=PASSWORD, 1=SENSITIVE, 2=INITIAL_CAPS_WORD, 3=INITIAL_CAPS_SENTENCE, 4=INITIAL_CAPS_ALL_CHARACTERS, 5=DEFAULT'),
        inputMode: z.number().optional().describe('0=ANY, 1=EMAIL, 2=NUMERIC, 3=PHONE, 4=URL, 5=DECIMAL, 6=SINGLE_LINE'),
        fontSize: z.number().optional().describe('Font size'),
        fontColor: colorSchema.describe('Font color'),
        returnType: z.number().optional().describe('Return key type'),
      }).describe('EditBox properties to set'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setupEditBox', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_setup_scrollview',
    'Configure cc.ScrollView: horizontal, vertical, inertia, elastic, brake, bounceDuration (batch setter)',
    {
      ...nodeRef,
      addIfMissing: z.boolean().optional().describe('Auto-add component if not present'),
      properties: z.object({
        horizontal: z.boolean().optional().describe('Enable horizontal scroll'),
        vertical: z.boolean().optional().describe('Enable vertical scroll'),
        inertia: z.boolean().optional().describe('Enable inertia'),
        elastic: z.boolean().optional().describe('Enable elastic bounce'),
        brake: z.number().optional().describe('Brake factor (0-1)'),
        bounceDuration: z.number().optional().describe('Bounce duration in seconds'),
      }).describe('ScrollView properties to set'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setupScrollView', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_setup_layout',
    'Configure cc.Layout: type, resizeMode, spacing, padding, cellSize, startAxis (batch setter)',
    {
      ...nodeRef,
      addIfMissing: z.boolean().optional().describe('Auto-add component if not present'),
      properties: z.object({
        type: z.number().optional().describe('0=NONE, 1=HORIZONTAL, 2=VERTICAL, 3=GRID'),
        resizeMode: z.number().optional().describe('0=NONE, 1=CONTAINER, 2=CHILDREN'),
        spacingX: z.number().optional().describe('Horizontal spacing'),
        spacingY: z.number().optional().describe('Vertical spacing'),
        paddingLeft: z.number().optional().describe('Left padding'),
        paddingRight: z.number().optional().describe('Right padding'),
        paddingTop: z.number().optional().describe('Top padding'),
        paddingBottom: z.number().optional().describe('Bottom padding'),
        cellSize: z.object({ width: z.number(), height: z.number() }).optional().describe('Cell size for GRID layout'),
        startAxis: z.number().optional().describe('0=HORIZONTAL, 1=VERTICAL (for GRID)'),
        verticalDirection: z.number().optional().describe('0=BOTTOM_TO_TOP, 1=TOP_TO_BOTTOM'),
        horizontalDirection: z.number().optional().describe('0=LEFT_TO_RIGHT, 1=RIGHT_TO_LEFT'),
        affectedByScale: z.boolean().optional().describe('Whether child scale affects layout'),
      }).describe('Layout properties to set'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setupLayout', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_setup_toggle',
    'Configure cc.Toggle: isChecked, interactable (batch setter)',
    {
      ...nodeRef,
      addIfMissing: z.boolean().optional().describe('Auto-add component if not present'),
      properties: z.object({
        isChecked: z.boolean().optional().describe('Toggle checked state'),
        interactable: z.boolean().optional().describe('Is toggle interactable'),
      }).describe('Toggle properties to set'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setupToggle', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_setup_slider',
    'Configure cc.Slider: direction, progress (batch setter)',
    {
      ...nodeRef,
      addIfMissing: z.boolean().optional().describe('Auto-add component if not present'),
      properties: z.object({
        direction: z.number().optional().describe('0=Horizontal, 1=Vertical'),
        progress: z.number().optional().describe('Current progress (0-1)'),
      }).describe('Slider properties to set'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setupSlider', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_setup_progressbar',
    'Configure cc.ProgressBar: mode, progress, totalLength, reverse (batch setter)',
    {
      ...nodeRef,
      addIfMissing: z.boolean().optional().describe('Auto-add component if not present'),
      properties: z.object({
        mode: z.number().optional().describe('0=HORIZONTAL, 1=VERTICAL, 2=FILLED'),
        progress: z.number().optional().describe('Current progress (0-1)'),
        totalLength: z.number().optional().describe('Total bar length'),
        reverse: z.boolean().optional().describe('Reverse direction'),
      }).describe('ProgressBar properties to set'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setupProgressBar', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_setup_richtext',
    'Configure cc.RichText: string (BBCode), fontSize, maxWidth, lineHeight, horizontalAlign (batch setter)',
    {
      ...nodeRef,
      addIfMissing: z.boolean().optional().describe('Auto-add component if not present'),
      properties: z.object({
        string: z.string().optional().describe('BBCode rich text string'),
        fontSize: z.number().optional().describe('Font size'),
        maxWidth: z.number().optional().describe('Max width (0 for unlimited)'),
        lineHeight: z.number().optional().describe('Line height'),
        horizontalAlign: z.number().optional().describe('0=LEFT, 1=CENTER, 2=RIGHT'),
        handleTouchEvent: z.boolean().optional().describe('Handle touch events on rich text'),
      }).describe('RichText properties to set'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setupRichText', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_setup_widget',
    'Configure cc.Widget: alignment flags, edge distances, isAlignOnce (batch setter)',
    {
      ...nodeRef,
      addIfMissing: z.boolean().optional().describe('Auto-add component if not present'),
      properties: z.object({
        isAlignTop: z.boolean().optional().describe('Align to top'),
        isAlignBottom: z.boolean().optional().describe('Align to bottom'),
        isAlignLeft: z.boolean().optional().describe('Align to left'),
        isAlignRight: z.boolean().optional().describe('Align to right'),
        isAlignHorizontalCenter: z.boolean().optional().describe('Align horizontal center'),
        isAlignVerticalCenter: z.boolean().optional().describe('Align vertical center'),
        top: z.number().optional().describe('Top edge distance'),
        bottom: z.number().optional().describe('Bottom edge distance'),
        left: z.number().optional().describe('Left edge distance'),
        right: z.number().optional().describe('Right edge distance'),
        horizontalCenter: z.number().optional().describe('Horizontal center offset'),
        verticalCenter: z.number().optional().describe('Vertical center offset'),
        isAlignOnce: z.boolean().optional().describe('Only align once on start'),
        alignMode: z.number().optional().describe('0=ONCE, 1=ON_WINDOW_RESIZE, 2=ALWAYS'),
      }).describe('Widget properties to set'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setupWidget', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
