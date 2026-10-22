/* ============================================================================
 *  应用内 AI 的工具集（浏览器侧）
 *
 *  与 MCP server 共用同一套实现：
 *      @mcp/session.mjs   方案状态机（层 / 几何 / 导出）
 *      @mcp/walls|regions|furniture|validate.mjs
 *  所以「AI 在面板里画的」和「AI 通过 MCP 画的」走的是完全相同的几何算法与校验，
 *  区别只有两处：
 *    · 这里不暴露 Node 专属能力（plan_export / asset_* / bridge_*）；
 *    · 参数用 JSON Schema（OpenAI function calling 格式），MCP 那侧用 zod。
 * ========================================================================== */
import { addWall, addRoomRect, addOpening, removeWall } from '@mcp/walls.mjs';
import { addRegionRect, removeRegion } from '@mcp/regions.mjs';
import {
  place, placeBatch, modify, remove as removeFurniture, list as listFurniture, CATALOG
} from '@mcp/furniture.mjs';
import { validate } from '@mcp/validate.mjs';
import { ToolError } from '@mcp/errors.mjs';

const obj = (properties, required = []) => ({
  type: 'object', properties, required, additionalProperties: false
});
const pt = desc => ({ type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], description: desc });
const num = desc => ({ type: 'number', description: desc });

const MATS = ['wood', 'tile800', 'tile600', 'marble', 'antislip', 'terrazzo', 'carpet', 'cement'];

/** 给 LLM 的工具清单（OpenAI function calling 格式） */
export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'plan_summary',
      description: '读取当前方案：楼层、房间与面积、家具计数。每轮先看它再动手。',
      parameters: obj({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'plan_validate',
      description: '自检当前楼层：墙体/门窗/区域/家具的合法性，返回 errors（必须修）与 warnings。改完必须调用。',
      parameters: obj({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'wall_add',
      description: '画一段正交墙（轴线，单位 mm）。type: n 隔墙 / b 承重 / e 外墙 / g 玻璃 / low 矮墙。',
      parameters: obj({
        a: pt('起点'),
        b: pt('终点（必须与起点共享 x 或 y）'),
        type: { type: 'string', enum: ['n', 'b', 'e', 'g', 'low'] },
        thickness: num('墙厚 mm，默认 n/g=120、b/e=240')
      }, ['a', 'b'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'wall_add_room_rect',
      description: '一次生成 4 面正交闭合墙。x/y/w/h 是轴线尺寸，内部净尺寸 = (w-t)×(h-t)。',
      parameters: obj({
        x: num('左上角 x'), y: num('左上角 y'), w: num('宽'), h: num('高（y 方向）'),
        type: { type: 'string', enum: ['n', 'b', 'e', 'g', 'low'] },
        thickness: num('墙厚 mm')
      }, ['x', 'y', 'w', 'h'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'wall_remove',
      description: '按下标删除用户新增的墙（模板自带墙不可删）。下标来自 wall_add 返回值。',
      parameters: obj({ index: { type: 'integer' } }, ['index'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'opening_add',
      description: '在墙上开洞：point 落在墙附近 150mm 内即可。kind: door/entry/double/win/slide/bay（飘窗）。承重墙不可开。',
      parameters: obj({
        point: pt('墙体定位点'),
        kind: { type: 'string', enum: ['door', 'entry', 'double', 'win', 'slide', 'bay'] },
        width: num('洞口宽 mm；默认 door 800 / win 1200 / slide 1600 / bay 1600'),
        depth: num('飘窗凸出深度 mm，默认 760'),
        side: { type: 'integer', enum: [-1, 1], description: '-1 小坐标侧 / 1 大坐标侧（飘窗朝反方向凸）' }
      }, ['point'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'region_add_rect',
      description: '划一块区域（房间/地面）。自动扣墙与门窗，必须贴墙；后画的会从先画的里面扣掉（先大后小做 L 形）。',
      parameters: obj({
        x: num('左上角 x'), y: num('左上角 y'), w: num('宽'), h: num('高'),
        name: { type: 'string', description: '房间名，如 主卧' },
        mat: { type: 'string', enum: MATS, description: '地面材质，默认 tile800' }
      }, ['x', 'y', 'w', 'h'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'region_remove',
      description: '按 id 删除区域。',
      parameters: obj({ id: { type: 'string' } }, ['id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'catalog_search',
      description: '检索家具库，摆放前必须先查。type 不能自造。',
      parameters: obj({
        q: { type: 'string', description: '名称或 type 子串，如 床 / 沙发' },
        cat: { type: 'string', description: '分类：卧室/客厅/餐厨/卫浴/家电/书房 · 休闲/隔断/楼层/户外 · 车库/户外 · 道路' },
        limit: { type: 'integer', description: '默认 30' }
      })
    }
  },
  {
    type: 'function',
    function: {
      name: 'furniture_place',
      description: '按中心坐标摆一件家具；压墙会自动推出（返回 pushedBy）。',
      parameters: obj({
        type: { type: 'string' }, x: num('中心 x'), y: num('中心 y'),
        rot: num('顺时针角度，默认 0'),
        w: num('覆盖默认宽'), d: num('覆盖默认深')
      }, ['type', 'x', 'y'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'furniture_place_batch',
      description: '一次摆完一个房间（≤120 件），单条失败不影响其它条。',
      parameters: obj({
        items: {
          type: 'array',
          items: obj({
            type: { type: 'string' }, x: num('中心 x'), y: num('中心 y'),
            rot: num('角度'), w: num('宽'), d: num('深')
          }, ['type', 'x', 'y'])
        }
      }, ['items'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'furniture_modify',
      description: '移动 / 旋转 / 改尺寸，只传要改的字段。',
      parameters: obj({
        id: { type: 'string' }, x: num('新中心 x'), y: num('新中心 y'),
        rot: num('角度'), w: num('宽'), d: num('深')
      }, ['id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'furniture_remove',
      description: '按 id 批量删除家具。',
      parameters: obj({ ids: { type: 'array', items: { type: 'string' } } }, ['ids'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'furniture_list',
      description: '列出家具（可按房间或 type 过滤），拿 id 用。',
      parameters: obj({ roomId: { type: 'string' }, type: { type: 'string' } })
    }
  },
  {
    type: 'function',
    function: {
      name: 'level_switch',
      description: '切换当前楼层，之后的写操作都作用在这一层。',
      parameters: obj({ id: { type: 'string' } }, ['id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'level_remove',
      description: '删除楼层及其全部家具 / 墙体 / 区域，至少保留一层；不传 id 时删当前层，删后自动切到相邻层。',
      parameters: obj({ id: { type: 'string', description: '楼层 id，省略 = 当前层' } })
    }
  },
  {
    type: 'function',
    function: {
      name: 'level_add',
      description: '新增一层（floor）或地下层（basement）并切过去。',
      parameters: obj({
        kind: { type: 'string', enum: ['floor', 'basement'] },
        name: { type: 'string' },
        clearH: num('层高 mm，默认 2800')
      })
    }
  }
];

const HANDLERS = {
  plan_summary: s => s.summary(),
  plan_validate: s => validate(s),
  wall_add: (s, a) => addWall(s, a),
  wall_add_room_rect: (s, a) => addRoomRect(s, a),
  wall_remove: (s, a) => removeWall(s, a.index),
  opening_add: (s, a) => addOpening(s, a),
  region_add_rect: (s, a) => addRegionRect(s, a),
  region_remove: (s, a) => removeRegion(s, a.id),
  catalog_search: (s, a) => {
    const q = String(a.q || '').toLowerCase();
    let hits = CATALOG.filter(c =>
      (!q || c.type.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.cat.includes(a.q)) &&
      (!a.cat || c.cat.includes(a.cat))
    );
    const total = hits.length;
    return { total, items: hits.slice(0, a.limit || 30) };
  },
  furniture_place: (s, a) => place(s, a),
  furniture_place_batch: (s, a) => placeBatch(s, a),
  furniture_modify: (s, a) => modify(s, a),
  furniture_remove: (s, a) => removeFurniture(s, a),
  furniture_list: (s, a) => listFurniture(s, a),
  level_switch: (s, a) => s.switchLevel(a.id),
  level_add: (s, a) => {
    const lv = s.addLevel(a);
    return { ...lv, levels: s.state.levels.map(l => ({ id: l.id, name: l.name, elev: l.elev, kind: l.kind })) };
  },
  level_remove: (s, a) => {
    const target = s.state.levels.find(l => l.id === (a.id || s.state.activeLevel));
    const lv = s.removeLevel(a.id);
    return {
      removed: target ? { id: target.id, name: target.name } : null,
      ...lv,
      levels: s.state.levels.map(l => ({ id: l.id, name: l.name, elev: l.elev, kind: l.kind }))
    };
  }
};

export const TOOL_NAMES = Object.keys(HANDLERS);

/** 执行一个工具；失败时抛 ToolError（由上层转成 tool 消息喂回模型） */
export function execTool(session, name, args){
  const fn = HANDLERS[name];
  if (!fn) throw new ToolError('TOOL_UNKNOWN', `没有工具「${name}」`, { fix: `可用：${TOOL_NAMES.join(' / ')}` });
  return fn(session, args || {});
}

/** 给聊天面板显示的一行结果摘要 */
export function labelOf(name, args, res){
  if (!res) return name;
  switch (name){
    case 'wall_add': return `画墙 ${Math.round((res.length || 0))}mm`;
    case 'wall_add_room_rect': return `画房间 ${args.w}×${args.h}`;
    case 'opening_add': return `开洞 ${res.kind} ${res.len || ''}`;
    case 'region_add_rect': return `区域「${res.name}」${res.area} m²`;
    case 'region_remove': return '删除区域';
    case 'furniture_place': return `摆放 ${res.name || res.type}`;
    case 'furniture_place_batch': return `摆放 ${res.placed} 件`;
    case 'furniture_modify': return '调整家具';
    case 'furniture_remove': return `删除 ${res.removed} 件`;
    case 'level_add': return `新增「${res.name}」`;
    case 'level_remove': return `删除「${res.removed?.name || '楼层'}」`;
    case 'level_switch': return `切到「${res.name}」`;
    case 'catalog_search': return `检索到 ${res.total} 个家具`;
    case 'plan_validate': return res.ok ? `自检通过（${res.counts.warnings} 条提示）` : `${res.counts.errors} 个错误`;
    case 'plan_summary': return '读取方案';
    default: return name;
  }
}
