/* 地库自检项的文案：UI 与报告共用，tr 由调用方注入（核心层不依赖 i18n） */
export function checkText(c, tr = (zh) => zh){
  switch (c.key){
    case 'total': return tr(`车位数 ${c.value}`, `${c.value} stalls`);
    case 'perHousehold': return tr(`户均车位 ${c.value}（≥ ${c.limit}）`, `${c.value} stalls/household (≥ ${c.limit})`);
    case 'households': return tr('填写户数后校验户均车位', 'Enter households to check the ratio');
    case 'evShare': return tr(`充电车位占比 ${c.value}%（≥ ${c.limit}%）`, `EV share ${c.value}% (≥ ${c.limit}%)`);
    case 'accessible': return tr(`无障碍车位 ${c.value} 个（≥ ${c.limit}）`, `${c.value} accessible stalls (≥ ${c.limit})`);
    case 'entry': return c.level === 'ok'
      ? tr('已设置地库出入口', 'Garage entrance present')
      : tr('缺少地库出入口', 'No garage entrance');
    case 'aisle': return c.level === 'ok'
      ? tr('已生成车道 / 地库模块', 'Aisles or garage module present')
      : tr('缺少车道或地库模块', 'No aisles or garage module');
    case 'connectivity': return c.level === 'ok'
      ? tr(`全部 ${c.limit} 个车位均可从出入口到达`, `All ${c.limit} stalls reachable`)
      : tr(`${c.value} / ${c.limit} 个车位无法从出入口到达`, `${c.value} / ${c.limit} stalls unreachable`);
    case 'slope': return c.level === 'ok'
      ? tr(`坡道最大坡度 ${c.value}%（≤ ${c.limit}%）`, `Max ramp slope ${c.value}% (≤ ${c.limit}%)`)
      : tr(`坡道坡度偏陡：${c.value}%（≤ ${c.limit}%）`, `Ramp too steep: ${c.value}% (≤ ${c.limit}%)`);
    case 'earthwork': return tr(`顶板覆土 ${c.value} m³ / 基坑土方 ${c.extra} m³（估算）`,
      `Soil ${c.value} m³ / excavation ${c.extra} m³ (est.)`);
  }
  return c.key;
}
