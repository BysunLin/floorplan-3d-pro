/* ============================================================================
 *  节点模型（Node Model）—— 方案数据的规范化描述
 *
 *  设计对齐 BIM 式编辑器：扁平字典 Record<id, Node> + parentId 表达父子关系，
 *  不再依赖「数组下标 + 硬编码几何」。
 *
 *  层级：
 *    site → building → level → wall ─ opening（门窗挂在墙上）
 *                          → zone / slab（房间、区域、楼板）
 *                          → item（家具）
 *
 *  约束：
 *    · 平面坐标单位 mm，洞口高度（sill / head）单位 m —— 与现有 3D 代码一致；
 *    · 节点本身不可变，增删改一律由 graph.js 返回新图；
 *    · 所有读写走 zod 校验，序列化前后都能发现脏数据。
 * ========================================================================== */
import { z } from 'zod';

/** 图结构版本：节点字段发生不兼容变化时递增（存档迁移用） */
export const NODE_VERSION = 1;

const vec2 = z.tuple([z.number(), z.number()]);
const rect4 = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const meta = z.record(z.string(), z.unknown()).default({});

/** 所有节点的公共字段 */
const base = {
  id: z.string().min(1),
  parentId: z.string().nullable(),
  visible: z.boolean().default(true),
  name: z.string().optional(),
  meta
};

export const SiteNodeSchema = z.object({
  ...base,
  type: z.literal('site')
});

export const BuildingNodeSchema = z.object({
  ...base,
  type: z.literal('building')
});

export const LevelNodeSchema = z.object({
  ...base,
  type: z.literal('level'),
  kind: z.enum(['floor', 'basement', 'loft']).default('floor'),
  elev: z.number().default(0),        // 相对首层标高（mm）
  clearH: z.number().positive().default(2800)  // 净高（mm）
});

/** 墙：中心线 a→b + 厚度，不再用「预先切好的矩形段」表达 */
export const WallNodeSchema = z.object({
  ...base,
  type: z.literal('wall'),
  a: vec2,
  b: vec2,
  thickness: z.number().positive(),
  kind: z.enum(['b', 'e', 'n', 'low', 'g']),   // 承重 / 外墙 / 非承重 / 矮墙 / 玻璃
  materialId: z.string().optional()
});

/**
 * 洞口：门窗挂在宿主墙上。
 * rect 保留平面足迹（2D 绘制 / 拾取仍按矩形走），sill / head 为竖向范围（米）。
 * suppressed = true 表示「洞口位置需要墙体填实」（例如二层以上不出现入户门）。
 */
export const OpeningNodeSchema = z.object({
  ...base,
  type: z.literal('opening'),
  kind: z.enum(['door', 'entry', 'double', 'slide', 'win', 'bay']),
  rect: rect4,
  sill: z.number().min(0).default(0),
  head: z.number().positive().default(2.1),
  suppressed: z.boolean().default(false),
  swing: z.object({
    hinge: vec2,
    close: vec2,
    open: vec2,
    len: z.number().positive()
  }).optional()
});

/** 房间 / 区域 / 楼板：多边形 + 地面材质 */
export const ZoneNodeSchema = z.object({
  ...base,
  type: z.literal('zone'),
  poly: z.array(vec2).min(3),
  holes: z.array(z.array(vec2)).default([]),
  mat: z.string().default('tile800'),
  outdoor: z.boolean().default(false),
  region: z.boolean().default(false),
  counted: z.boolean().default(true)
});

/** 家具 / 家电 / 楼梯等可摆放物件 */
export const ItemNodeSchema = z.object({
  ...base,
  type: z.literal('item'),
  itemType: z.string().min(1),
  cx: z.number(),
  cy: z.number(),
  w: z.number().positive(),
  d: z.number().positive(),
  rot: z.number().default(0),
  color: z.string().optional()
});

export const NodeSchema = z.discriminatedUnion('type', [
  SiteNodeSchema,
  BuildingNodeSchema,
  LevelNodeSchema,
  WallNodeSchema,
  OpeningNodeSchema,
  ZoneNodeSchema,
  ItemNodeSchema
]);

export const PlanGraphSchema = z.object({
  version: z.literal(NODE_VERSION),
  rootId: z.string().min(1),
  nodes: z.record(z.string(), NodeSchema)
});

/** 解析并校验整张图；失败时抛出带路径的 zod 错误 */
export function parseGraph(input){
  return PlanGraphSchema.parse(input);
}

/** 解析并校验单个节点 */
export function parseNode(input){
  return NodeSchema.parse(input);
}

/** 不抛异常的版本，供导入 / 迁移路径使用 */
export function safeParseGraph(input){
  return PlanGraphSchema.safeParse(input);
}
