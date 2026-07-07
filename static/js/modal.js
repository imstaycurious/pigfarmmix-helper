/**
 * 通用模态框组件
 */

let modalContainer = null;

/**
 * 初始化模态框容器
 */
function initModalContainer() {
  if (modalContainer) return;

  modalContainer = document.createElement('div');
  modalContainer.id = 'customModalContainer';
  modalContainer.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 99999;';
  document.body.appendChild(modalContainer);
}

/**
 * 显示通用模态框
 * @param {object} options - 配置选项
 * @param {string} options.title - 标题
 * @param {string} options.message - 消息内容
 * @param {string} options.type - 类型 'alert' | 'confirm'
 * @param {string} options.confirmText - 确认按钮文本
 * @param {string} options.cancelText - 取消按钮文本
 * @returns {Promise<boolean>} - confirm 返回 true/false，alert 返回 true
 */
export function showModal({ title = '提示', message = '', type = 'alert', confirmText = '确定', cancelText = '取消' }) {
  initModalContainer();

  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.innerHTML = `
      <div class="custom-modal-backdrop"></div>
      <div class="custom-modal-content">
        <div class="custom-modal-header">
          <h3>${escapeHtml(title)}</h3>
        </div>
        <div class="custom-modal-body">
          <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        </div>
        <div class="custom-modal-footer">
          ${type === 'confirm' ? `<button class="custom-modal-btn secondary" data-action="cancel">${escapeHtml(cancelText)}</button>` : ''}
          <button class="custom-modal-btn primary" data-action="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    modalContainer.appendChild(modal);

    // 动画进入
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    // 处理按钮点击
    const handleAction = (result) => {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.remove();
        resolve(result);
      }, 200);
    };

    modal.querySelector('[data-action="confirm"]').addEventListener('click', () => handleAction(true));

    if (type === 'confirm') {
      modal.querySelector('[data-action="cancel"]').addEventListener('click', () => handleAction(false));
    }

    // 点击背景关闭（仅 alert）
    if (type === 'alert') {
      modal.querySelector('.custom-modal-backdrop').addEventListener('click', () => handleAction(true));
    }

    // ESC 键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEsc);
        handleAction(type === 'confirm' ? false : true);
      }
    };
    document.addEventListener('keydown', handleEsc);
  });
}

/**
 * 简化的 alert 函数
 */
export function customAlert(message, title = '提示') {
  return showModal({ title, message, type: 'alert' });
}

/**
 * 简化的 confirm 函数
 */
export function customConfirm(message, title = '确认') {
  return showModal({ title, message, type: 'confirm' });
}

/**
 * 转义 HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
