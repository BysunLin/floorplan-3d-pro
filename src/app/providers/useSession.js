/* ============================================================================
 *  「是否编辑过」的一次性标记
 *
 *  初始化界面里的「正在编辑」只在用户真的处于编辑状态时出现：
 *    · 本次已经进入编辑器（overlay 打开）→ 一定展示；
 *    · 重新打开页面 → 只有曾经进入过编辑器才展示，首次使用不展示。
 *
 *  只用一个字符串标记，缺省 / 隐私模式下读写失败都当作「没编辑过」。
 * ========================================================================== */
const KEY = 'huxing-editing';

export function hasEditingSession(){
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function markEditingSession(){
  try { localStorage.setItem(KEY, '1'); } catch { /* 隐私模式：忽略 */ }
}
