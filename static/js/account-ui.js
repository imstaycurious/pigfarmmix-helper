/**
 * 账号管理功能 (UI)
 */
import { getCurrentUser, isLoggedIn, register, login, logout } from "./auth.js";
import { syncWithCloud, pullFromCloud } from "./sync.js";
import { state } from "./state.js";
import { loadCollection, loadOwnedEventPigs, loadBadgeSet } from "./storage.js";
import { STORAGE_KEY_BADGE_SMALL, STORAGE_KEY_BADGE_BIG } from "./constants.js";
import { customAlert, customConfirm } from "./modal.js";
/** 从 localStorage 重新加载 state */
function reloadStateFromStorage() {
    state.collection = loadCollection();
    state.ownedSet = new Set(state.collection);
    state.ownedEventPigs = loadOwnedEventPigs();
    state.smallBadges = loadBadgeSet(STORAGE_KEY_BADGE_SMALL);
    state.bigBadges = loadBadgeSet(STORAGE_KEY_BADGE_BIG);
}
function updateAccountUI() {
    const loggedOut = document.getElementById("accountLoggedOut");
    const loggedIn = document.getElementById("accountLoggedIn");
    if (!loggedOut || !loggedIn)
        return;
    const user = getCurrentUser();
    if (user) {
        loggedOut.style.display = "none";
        loggedIn.style.display = "flex";
        const nick = document.getElementById("accountNickname");
        const device = document.getElementById("accountDeviceCode");
        if (nick)
            nick.textContent = user.nickname;
        if (device)
            device.textContent = `设备码: ${user.deviceCode}`;
        updateLastSyncTime();
    }
    else {
        loggedOut.style.display = "flex";
        loggedIn.style.display = "none";
    }
}
function updateLastSyncTime() {
    const user = getCurrentUser();
    const el = document.getElementById("accountSyncTime");
    if (!el)
        return;
    if (user && user.lastSyncAt) {
        const now = Date.now();
        const diff = now - user.lastSyncAt;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        let timeText;
        if (minutes < 1)
            timeText = "刚刚";
        else if (minutes < 60)
            timeText = `${minutes}分钟前`;
        else if (hours < 24)
            timeText = `${hours}小时前`;
        else
            timeText = `${days}天前`;
        el.textContent = timeText;
    }
    else {
        el.textContent = "未同步";
    }
}
function showModal(modalId) {
    const m = document.getElementById(modalId);
    if (m)
        m.style.display = "flex";
}
function hideModal(modalId) {
    const m = document.getElementById(modalId);
    if (m)
        m.style.display = "none";
}
function setFormMessage(elementId, message, isError = false) {
    const el = document.getElementById(elementId);
    if (!el)
        return;
    el.textContent = message;
    el.className = "account-form-hint " + (isError ? "error" : "success");
}
function clearFormMessage(elementId) {
    const el = document.getElementById(elementId);
    if (el)
        el.textContent = "";
}
/** 初始化账号管理 UI */
export function initAccountUI({ toast, render }) {
    // 注册流程
    document.getElementById("showRegisterFormBtn")?.addEventListener("click", () => {
        showModal("registerFormModal");
        const input = document.getElementById("registerNickname");
        if (input)
            input.value = "";
        clearFormMessage("registerFormMsg");
    });
    document.getElementById("closeRegisterFormBtn")?.addEventListener("click", () => hideModal("registerFormModal"));
    document.getElementById("cancelRegisterBtn")?.addEventListener("click", () => hideModal("registerFormModal"));
    document.getElementById("registerBtn")?.addEventListener("click", async () => {
        const btn = document.getElementById("registerBtn");
        const nicknameEl = document.getElementById("registerNickname");
        const nickname = nicknameEl ? nicknameEl.value.trim() : "";
        if (!nickname) {
            setFormMessage("registerFormMsg", "请输入昵称", true);
            return;
        }
        if (btn) {
            btn.disabled = true;
            btn.textContent = "注册中...";
        }
        clearFormMessage("registerFormMsg");
        try {
            const result = await register(nickname);
            if (result.ok && result.user) {
                hideModal("registerFormModal");
                const deviceCode = result.user.deviceCode;
                await customAlert(`⚠️ 请务必保存你的设备码:\n\n${deviceCode}\n\n请立即截图或抄写保存!\n丢失设备码将无法登录,可能导致数据永久丢失。`, "注册成功");
                const shouldSync = await customConfirm("是否立即同步数据到云端?", "建议首次注册后立即同步,确保数据安全。");
                if (shouldSync) {
                    await syncWithCloud({
                        onDataUpdated: () => { reloadStateFromStorage(); render(); },
                    });
                    toast("数据已同步到云端");
                }
                updateAccountUI();
            }
            else {
                setFormMessage("registerFormMsg", result.error || "注册失败", true);
            }
        }
        catch {
            setFormMessage("registerFormMsg", "网络错误,请稍后重试", true);
        }
        finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "注册";
            }
        }
    });
    // 登录流程
    document.getElementById("showLoginFormBtn")?.addEventListener("click", () => {
        showModal("loginFormModal");
        const nick = document.getElementById("loginNickname");
        const dev = document.getElementById("loginDeviceCode");
        if (nick)
            nick.value = "";
        if (dev)
            dev.value = "";
        clearFormMessage("loginFormMsg");
    });
    document.getElementById("closeLoginFormBtn")?.addEventListener("click", () => hideModal("loginFormModal"));
    document.getElementById("cancelLoginBtn")?.addEventListener("click", () => hideModal("loginFormModal"));
    document.getElementById("loginBtn")?.addEventListener("click", async () => {
        const btn = document.getElementById("loginBtn");
        const nickEl = document.getElementById("loginNickname");
        const devEl = document.getElementById("loginDeviceCode");
        const nickname = nickEl ? nickEl.value.trim() : "";
        const deviceCode = devEl ? devEl.value.trim().toUpperCase() : "";
        if (!nickname || !deviceCode) {
            setFormMessage("loginFormMsg", "请输入昵称和设备码", true);
            return;
        }
        if (btn) {
            btn.disabled = true;
            btn.textContent = "登录中...";
        }
        clearFormMessage("loginFormMsg");
        try {
            const result = await login(nickname, deviceCode);
            if (result.ok) {
                hideModal("loginFormModal");
                toast("登录成功");
                updateAccountUI();
                // 登录后必须「先合并再上传」
                const onDataUpdated = () => { reloadStateFromStorage(); render(); };
                const pulled = await pullFromCloud({ onDataUpdated });
                if (pulled.ok) {
                    await syncWithCloud({ onDataUpdated });
                    updateLastSyncTime();
                }
                else {
                    toast(`云端数据读取失败:${pulled.error || "未知错误"},本次未上传`);
                }
            }
            else {
                setFormMessage("loginFormMsg", result.error || "登录失败", true);
            }
        }
        catch {
            setFormMessage("loginFormMsg", "网络错误,请稍后重试", true);
        }
        finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "登录";
            }
        }
    });
    // 退出登录
    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
        const confirmed = await customConfirm("确定退出登录吗?\n\n本地数据不会丢失,下次登录后可以继续同步。", "退出登录");
        if (confirmed) {
            logout();
            updateAccountUI();
            toast("已退出登录");
        }
    });
    // 同步 (双向)
    document.getElementById("syncBothBtn")?.addEventListener("click", async () => {
        if (!isLoggedIn()) {
            toast("请先登录");
            return;
        }
        const btn = document.getElementById("syncBothBtn");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "⏳";
        }
        try {
            const result = await syncWithCloud({
                onDataUpdated: () => { reloadStateFromStorage(); render(); },
            });
            if (result.ok) {
                toast("同步完成");
                updateLastSyncTime();
            }
            else {
                toast(`同步失败: ${result.error}`);
            }
        }
        catch {
            toast("网络错误,请稍后重试");
        }
        finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "同步";
            }
        }
    });
    // 点击模态框背景关闭
    document.getElementById("loginFormModal")?.addEventListener("click", (e) => {
        if (e.target.id === "loginFormModal")
            hideModal("loginFormModal");
    });
    document.getElementById("registerFormModal")?.addEventListener("click", (e) => {
        if (e.target.id === "registerFormModal")
            hideModal("registerFormModal");
    });
    // 初始化账号UI
    updateAccountUI();
    // 如果已登录,尝试自动同步
    if (isLoggedIn()) {
        const user = getCurrentUser();
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        if (!user.lastSyncAt || now - user.lastSyncAt > fiveMinutes) {
            syncWithCloud({
                onDataUpdated: () => { reloadStateFromStorage(); render(); },
            }).catch(err => {
                console.error("Auto sync failed:", err);
            });
        }
    }
}
