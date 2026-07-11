// ========================================
// 账号管理功能
// ========================================

import { getCurrentUser, isLoggedIn, register, login, logout } from './auth.js';
import { syncWithCloud, pullFromCloud } from './sync.js';
import { state } from './state.js';
import {
  loadCollection,
  loadOwnedEventPigs,
  loadBadgeSet,
} from './storage.js';
import {
  STORAGE_KEY_BADGE_SMALL,
  STORAGE_KEY_BADGE_BIG,
} from './constants.js';
import { customAlert, customConfirm } from './modal.js';

/**
 * 从 localStorage 重新加载 state
 */
function reloadStateFromStorage() {
  state.collection = loadCollection();
  state.ownedSet = new Set(state.collection);
  state.ownedEventPigs = loadOwnedEventPigs();
  state.smallBadges = loadBadgeSet(STORAGE_KEY_BADGE_SMALL);
  state.bigBadges = loadBadgeSet(STORAGE_KEY_BADGE_BIG);
}

/**
 * 初始化账号管理 UI
 * @param {object} deps - 依赖注入
 * @param {function} deps.toast - 提示函数
 * @param {function} deps.render - 重新渲染函数
 */
export function initAccountUI({ toast, render }) {

function updateAccountUI() {
  const loggedOut = document.getElementById('accountLoggedOut');
  const loggedIn = document.getElementById('accountLoggedIn');
  const user = getCurrentUser();

  if (user) {
    // 已登录
    loggedOut.style.display = 'none';
    loggedIn.style.display = 'flex';
    document.getElementById('accountNickname').textContent = user.nickname;
    document.getElementById('accountDeviceCode').textContent = `设备码: ${user.deviceCode}`;
    updateLastSyncTime();
  } else {
    // 未登录
    loggedOut.style.display = 'flex';
    loggedIn.style.display = 'none';
  }
}

function updateLastSyncTime() {
  const user = getCurrentUser();
  const el = document.getElementById('accountSyncTime');
  if (!el) return;

  if (user && user.lastSyncAt) {
    const now = Date.now();
    const diff = now - user.lastSyncAt;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    let timeText;
    if (minutes < 1) timeText = '刚刚';
    else if (minutes < 60) timeText = `${minutes}分钟前`;
    else if (hours < 24) timeText = `${hours}小时前`;
    else timeText = `${days}天前`;

    el.textContent = timeText;
  } else {
    el.textContent = '未同步';
  }
}

function showModal(modalId) {
  document.getElementById(modalId).style.display = 'flex';
}

function hideModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

function setFormMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = 'account-form-hint ' + (isError ? 'error' : 'success');
}

function clearFormMessage(elementId) {
  document.getElementById(elementId).textContent = '';
}

// 显示注册表单
document.getElementById('showRegisterFormBtn').addEventListener('click', () => {
  showModal('registerFormModal');
  document.getElementById('registerNickname').value = '';
  clearFormMessage('registerFormMsg');
});

// 关闭注册表单
document.getElementById('closeRegisterFormBtn').addEventListener('click', () => {
  hideModal('registerFormModal');
});

document.getElementById('cancelRegisterBtn').addEventListener('click', () => {
  hideModal('registerFormModal');
});

// 注册
document.getElementById('registerBtn').addEventListener('click', async () => {
  const btn = document.getElementById('registerBtn');
  const nickname = document.getElementById('registerNickname').value.trim();

  if (!nickname) {
    setFormMessage('registerFormMsg', '请输入昵称', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = '注册中...';
  clearFormMessage('registerFormMsg');

  try {
    const result = await register(nickname);
    if (result.ok) {
      hideModal('registerFormModal');

      // 显示设备码并强调保存的重要性
      const deviceCode = result.user.deviceCode;
      await customAlert(
        `⚠️ 请务必保存你的设备码：\n\n${deviceCode}\n\n请立即截图或抄写保存！\n丢失设备码将无法登录，可能导致数据永久丢失。`,
        '注册成功'
      );

      // 询问是否立即同步
      const shouldSync = await customConfirm(
        '是否立即同步数据到云端？',
        '建议首次注册后立即同步，确保数据安全。'
      );
      if (shouldSync) {
        await syncWithCloud({
          onDataUpdated: () => {
            reloadStateFromStorage();
            render();
          }
        });
        toast('数据已同步到云端');
      }

      updateAccountUI();
    } else {
      setFormMessage('registerFormMsg', result.error || '注册失败', true);
    }
  } catch (error) {
    setFormMessage('registerFormMsg', '网络错误，请稍后重试', true);
  } finally {
    btn.disabled = false;
    btn.textContent = '注册';
  }
});

// 显示登录表单
document.getElementById('showLoginFormBtn').addEventListener('click', () => {
  showModal('loginFormModal');
  document.getElementById('loginNickname').value = '';
  document.getElementById('loginDeviceCode').value = '';
  clearFormMessage('loginFormMsg');
});

// 关闭登录表单
document.getElementById('closeLoginFormBtn').addEventListener('click', () => {
  hideModal('loginFormModal');
});

document.getElementById('cancelLoginBtn').addEventListener('click', () => {
  hideModal('loginFormModal');
});

// 登录
document.getElementById('loginBtn').addEventListener('click', async () => {
  const btn = document.getElementById('loginBtn');
  const nickname = document.getElementById('loginNickname').value.trim();
  const deviceCode = document.getElementById('loginDeviceCode').value.trim().toUpperCase();

  if (!nickname || !deviceCode) {
    setFormMessage('loginFormMsg', '请输入昵称和设备码', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = '登录中...';
  clearFormMessage('loginFormMsg');

  try {
    const result = await login(nickname, deviceCode);
    if (result.ok) {
      hideModal('loginFormModal');
      toast('登录成功');
      updateAccountUI();

      // 登录后自动同步
      await syncWithCloud({
        onDataUpdated: () => {
          reloadStateFromStorage();
          render();
        }
      });
    } else {
      setFormMessage('loginFormMsg', result.error || '登录失败', true);
    }
  } catch (error) {
    setFormMessage('loginFormMsg', '网络错误，请稍后重试', true);
  } finally {
    btn.disabled = false;
    btn.textContent = '登录';
  }
});

// 退出登录
document.getElementById('logoutBtn').addEventListener('click', async () => {
  const confirmed = await customConfirm(
    '确定退出登录吗？\n\n本地数据不会丢失，下次登录后可以继续同步。',
    '退出登录'
  );

  if (confirmed) {
    logout();
    updateAccountUI();
    toast('已退出登录');
  }
});

// 同步（双向）
document.getElementById('syncBothBtn').addEventListener('click', async () => {
  if (!isLoggedIn()) {
    toast('请先登录');
    return;
  }

  const btn = document.getElementById('syncBothBtn');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '⏳';

  try {
    const result = await syncWithCloud({
      onDataUpdated: () => {
        reloadStateFromStorage();
        render();
      }
    });
    if (result.ok) {
      toast('同步完成');
      updateLastSyncTime(); // 刷新同步时间显示
    } else {
      toast(`同步失败: ${result.error}`);
    }
  } catch (error) {
    toast('网络错误，请稍后重试');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

// 点击模态框背景关闭
document.getElementById('loginFormModal').addEventListener('click', (e) => {
  if (e.target.id === 'loginFormModal') {
    hideModal('loginFormModal');
  }
});

document.getElementById('registerFormModal').addEventListener('click', (e) => {
  if (e.target.id === 'registerFormModal') {
    hideModal('registerFormModal');
  }
});

// 初始化账号UI
updateAccountUI();

// 如果已登录，尝试自动同步（距离上次同步超过5分钟）
if (isLoggedIn()) {
  const user = getCurrentUser();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (!user.lastSyncAt || now - user.lastSyncAt > fiveMinutes) {
    console.log('Auto syncing...');
    // 云端胜出时必须重载 state 并重渲染，否则内存里的旧数据会在下次
    // 本地操作时写回 localStorage，把刚下载的云端数据覆盖掉
    syncWithCloud({
      onDataUpdated: () => {
        reloadStateFromStorage();
        render();
      }
    }).catch(err => {
      console.error('Auto sync failed:', err);
    });
  }
}

} // 结束 initAccountUI 函数
