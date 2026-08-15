/**
 * 跨模块运行时回调注册表
 *
 * drawer(抽屉详情) 与 raising(养成) 互相调用,直接互相 import 会形成循环依赖。
 * 这里用一个注册表持有回调,由 app.ts 在启动时注入真实实现。
 */
export const runtime = {
    /** 打开抽屉详情 */
    showDetail: (_pNo) => { },
    /** 加入养成 (status: active 正在养成 / waiting 等待进货) */
    addRaisingPig: (_pNo, _status) => { },
    /** 全量渲染 */
    render: () => { },
    /** 渲染养成列表 */
    renderRaisingBody: () => { },
    /** 渲染养成搜索结果 */
    renderRaisingSearchResults: () => { },
    /** 更新养成倒计时 */
    updateRaisingCountdownNodes: () => { },
    /** 检查养成提醒 */
    checkRaisingReminders: () => { },
    /** 保存养成状态 (含云端同步调度) */
    saveRaisingState: () => { },
    /** 同步地板选择器 */
    syncRaisingFloorSelect: () => { },
    /** 生成养成记录 id */
    makeRaisingId: () => Date.now().toString(36),
};
