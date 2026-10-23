/* 地库指标报告（CSV）：可直接用 Excel 打开，带 UTF-8 BOM */
import { checkText } from './text.js';

const cell = v => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * @param {{audit:object, name?:string, presetLabel?:string, date?:Date,
 *          tr?:(zh:string,en:string)=>string}} opt
 */
export function buildGarageReportCsv({ audit, name = '', presetLabel = '', date = new Date(), tr } = {}){
  const t = tr || ((zh) => zh);
  const { stats, connectivity, slope, earthwork, checks } = audit;
  const rows = [];
  const push = (...cells) => rows.push(cells.map(cell).join(','));

  push(t('地库指标报告', 'Basement Garage Report'));
  push(t('方案', 'Plan'), name);
  push(t('生成时间', 'Generated'), date.toISOString().slice(0, 19).replace('T', ' '));
  push(t('规则包', 'Rule preset'), presetLabel);
  push('');

  push(t('指标', 'Metric'), t('数值', 'Value'));
  push(t('总车位', 'Total stalls'), stats.total);
  push(t('标准车位', 'Standard'), stats.standard);
  push(t('充电车位', 'EV'), stats.ev);
  push(t('无障碍车位', 'Accessible'), stats.accessible);
  push(t('子母车位', 'Tandem'), stats.tandem);
  push(t('微型车位', 'Compact'), stats.compact);
  push(t('地库模块（个 / 车位）', 'Garage modules (count / stalls)'), `${stats.modules} / ${stats.moduleStalls}`);
  push('');

  push(t('自检项', 'Check'), t('状态', 'Status'), t('数值', 'Value'));
  for (const c of checks){
    const status = c.level === 'ok' ? t('通过', 'OK') : c.level === 'warn' ? t('提示', 'Warn') : t('说明', 'Info');
    push(checkText(c, t), status, c.value ?? '');
  }
  push('');

  push(t('车道连通性', 'Aisle connectivity'), t('数值', 'Value'));
  push(t('车位总数', 'Stalls'), connectivity.stalls);
  push(t('无法到达的车位', 'Unreachable stalls'), connectivity.unreachable);
  push(t('通道段数', 'Aisle segments'), connectivity.segments);
  push(t('连通分量', 'Components'), connectivity.components);
  push(t('出入口数量', 'Entrances'), connectivity.entrances);
  push(t('孤立通道', 'Isolated aisles'), connectivity.isolated);
  push('');

  push(t('坡道 / 车道', 'Ramps / Aisles'), t('数值', 'Value'));
  push(t('坡道数量', 'Ramps'), slope.count);
  push(t('最大坡度（%）', 'Max slope (%)'), slope.maxSlope);
  push(t('车道净宽（m）', 'Aisle width (m)'), slope.aisleWidth ?? '');
  push('');

  push(t('土方估算', 'Earthwork (est.)'), t('数值', 'Value'));
  push(t('顶板覆土面积（m²）', 'Slab area (m²)'), earthwork.slabArea);
  push(t('覆土体积（m³，按 1.0m）', 'Soil volume (m³, 1.0m)'), earthwork.soilVolume);
  push(t('基坑开挖面积（m²）', 'Excavation area (m²)'), earthwork.excavationArea);
  push(t('地库埋深（m）', 'Depth (m)'), earthwork.depth);
  push(t('基坑土方（m³）', 'Excavation volume (m³)'), earthwork.excavationVolume);
  push('');
  push(t('说明：坡道坡度按单层高差 3.6m 估算，土方按覆土 1.0m / 工作面 0.6m 估算，仅供方案阶段参考。',
    'Notes: ramp slope assumes 3.6m floor-to-floor; earthwork assumes 1.0m soil and 0.6m working layer. Concept stage only.'));

  return '\ufeff' + rows.join('\r\n');
}

/** 报告文件名：garage-report-YYYYMMDD.csv */
export function garageReportFileName(date = new Date()){
  const pad = n => String(n).padStart(2, '0');
  return `garage-report-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.csv`;
}
