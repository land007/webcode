'use strict';

// ── Translations ──────────────────────────────────────────────────────────────

const translations = {
  'zh-CN': {
    // Wizard header
    title:            'webcode 启动器',
    subtitle:         '浏览器可访问的开发环境，由 Docker 驱动',

    // Step 1
    step1_detecting:  '正在检测运行环境…',
    docker_installed: 'Docker 已安装',
    docker_running:   'Docker 正在运行',
    badge_checking:   '检测中',
    docker_help_prefix: '请先安装并启动',
    docker_help_suffix: '，然后刷新检测。',
    docker_help_mac_title: 'macOS：安装 Docker Desktop',
    docker_help_mac_dl: '下载 Docker Desktop for Mac',
    docker_help_mac_step2: '打开 .dmg，将 Docker 拖入应用程序文件夹',
    docker_help_mac_step3: '启动 Docker Desktop，等待菜单栏图标稳定',
    docker_help_win_title: 'Windows：安装 Docker Desktop',
    docker_help_win_dl: '下载 Docker Desktop for Windows',
    docker_help_win_step2: '运行安装程序，启用 WSL2 后端',
    docker_help_win_step3: '安装完成重启后，启动 Docker Desktop',
    docker_help_notrunning_title: 'Docker 已安装但未运行',
    docker_help_notrunning_body: '请打开 Docker Desktop，等待图标稳定后重新检测。',
    btn_recheck:      '重新检测',
    btn_step1_next:   '下一步',

    // Step 2
    label_run_mode:   '运行模式',
    mode_desktop:     '🖥 Desktop（完整桌面）',
    mode_lite:        '⚡ Lite（仅 IDE + 看板）',
    label_auth_password: 'Basic Auth 密码',
    label_vnc_password:  'VNC 密码',
    label_openclaw_token: 'OpenClaw Token',
    summary_advanced: '高级选项',
    label_auth_user:  'Basic Auth 用户名',
    label_vnc_resolution: 'VNC 分辨率',
    label_git_name:   'Git 用户名',
    label_git_email:  'Git 邮箱',
    ph_optional:      '（可选）',
    label_cf_token:   'Cloudflare Tunnel Token（可选）',
    label_port_config: '端口配置（自动检测冲突）',
    btn_check_ports:  '🔍 检测端口冲突',
    btn_step2_back:   '上一步',
    btn_step2_next:   '下一步：启动容器',

    // Step 3
    step3_desc:       '正在启动 webcode 容器，首次运行将拉取镜像（约 2–5 分钟）…',
    btn_step3_back:   '返回配置',
    btn_step3_next:   '进入工作区 →',

    // Step 4
    step4_desc:       '配置已加载，容器当前未运行。',
    btn_step4_start:  '▶ 启动容器',
    btn_step4_config: '修改配置',
    btn_step4_enter:  '直接进入工作区',

    // Workspace tabs
    tab_status:       '状态',
    tab_vnc:          '桌面',
    tab_ide:          'IDE',
    tab_kanban:       '看板',
    tab_ai:           'AI',
    title_refresh:    '刷新',
    title_open_browser: '在浏览器中打开',
    status_detecting: '检测中…',
    btn_restart:      '重启',
    btn_stop:         '停止',

    // Status panel
    h_container_status: '容器状态',
    state_unknown:    '未知',
    h_config:         '配置',
    label_run_mode_ws: '运行模式',
    mode_desktop_short: '🖥 Desktop',
    mode_lite_short:  '⚡ Lite',
    label_port_config_ws: '端口配置',
    btn_save_config:  '保存配置',
    btn_save_restart: '保存并重启容器',
    h_container_logs: '容器日志',

    // Theme switcher
    theme_dark:   '暗色',
    theme_light:  '浅色',
    theme_system: '系统',

    // Dynamic strings (used in JS via t())
    dyn_not_found:    '未找到',
    dyn_running:      '运行中',
    dyn_not_running:  '未运行',
    dyn_stopped:      '已停止',
    dyn_launch_ok:    '\n✓ 容器启动成功！\n',
    dyn_launch_fail:  '\n✗ 启动失败（exit {code}）\n',
    dyn_relaunch_ok:  '\n✓ 启动成功！\n',
    dyn_confirm_restart: '确定要重启容器吗？',
    dyn_confirm_stop:    '确定要停止容器吗？',
    dyn_port_conflict:   '检测到端口冲突！是否自动修复？',
    dyn_port_occupied:   '  - {name} 端口 {port} 被占用',
    dyn_port_fixed:   '端口已自动调整，请保存配置以生效。',
    dyn_port_ok:      '所有端口均可用！',
    dyn_config_saved: '配置已保存。如需生效请重启容器。',
    // 问题4: 重启反馈
    dyn_restarting:   '重启中…',
    dyn_stopping:     '停止中…',
    // 进程重启相关
    title_restart_process:     '重启进程',
    title_view_logs:           '查看日志',
    dyn_confirm_restart_process: '确定要重启进程 {name} 吗？',
    dyn_restart_failed:        '重启失败 (exit {code})',
    dyn_loading_logs:          '加载日志中…',
    dyn_logs_for_process:      '{name} 日志：',
    // 区块标题
    adv_title_run_mode:   '运行模式',
    adv_title_auth:       '访问认证',
    adv_title_git:        'Git 配置',
    adv_title_cloudflare: 'Cloudflare Tunnel',
    // 自定义挂载 & 端口映射
    label_volumes:    '自定义目录挂载',
    btn_add_volume:   '+ 添加挂载',
    btn_add_port_map: '+ 添加端口',
    adv_title_ports:        '端口配置',
    adv_title_volumes:      '目录挂载',
    adv_sub_custom_ports:   '自定义端口映射',
    adv_sub_custom_volumes: '自定义目录挂载',
    label_host:       '主机',
    label_container:  '容器',
    ph_host_path:     '宿主机路径或命名卷',
    ph_container_path: '容器路径',
    btn_pick_dir:     '选择文件夹',
    label_named_volumes: '已挂载命名卷',
    // 问题6: Supervisor 状态
    h_supervisor_status: '进程状态',
    // 问题7: Cloudflare 引导
    cf_help_text:     '如何获取 Token？',
    cf_help_link:     'Cloudflare Zero Trust 控制台',
    cf_help_steps:    ' → Networks → Tunnels → 创建 Tunnel → 复制 token',
    // 清空卷
    btn_clear_vol:    '清空',
    dyn_confirm_clear_vol: '确定要清空卷 {name}？\n将永久删除其中所有数据，且不可恢复。\n\n操作将自动停止容器，完成后需手动重启。',
  },

  'en': {
    // Wizard header
    title:            'webcode Launcher',
    subtitle:         'Browser-accessible dev environment, powered by Docker',

    // Step 1
    step1_detecting:  'Checking environment…',
    docker_installed: 'Docker installed',
    docker_running:   'Docker is running',
    badge_checking:   'Checking',
    docker_help_prefix: 'Please install and start',
    docker_help_suffix: ', then refresh.',
    docker_help_mac_title: 'macOS: Install Docker Desktop',
    docker_help_mac_dl: 'Download Docker Desktop for Mac',
    docker_help_mac_step2: 'Open the .dmg and drag Docker to Applications',
    docker_help_mac_step3: 'Launch Docker Desktop and wait for the menu bar icon to stabilize',
    docker_help_win_title: 'Windows: Install Docker Desktop',
    docker_help_win_dl: 'Download Docker Desktop for Windows',
    docker_help_win_step2: 'Run the installer and enable the WSL2 backend',
    docker_help_win_step3: 'Restart when prompted, then launch Docker Desktop',
    docker_help_notrunning_title: 'Docker is installed but not running',
    docker_help_notrunning_body: 'Open Docker Desktop and wait for the icon to stabilize, then re-check.',
    btn_recheck:      'Re-check',
    btn_step1_next:   'Next',

    // Step 2
    label_run_mode:   'Run mode',
    mode_desktop:     '🖥 Desktop (full desktop)',
    mode_lite:        '⚡ Lite (IDE + Kanban only)',
    label_auth_password: 'Basic Auth password',
    label_vnc_password:  'VNC password',
    label_openclaw_token: 'OpenClaw Token',
    summary_advanced: 'Advanced options',
    label_auth_user:  'Basic Auth username',
    label_vnc_resolution: 'VNC resolution',
    label_git_name:   'Git username',
    label_git_email:  'Git email',
    ph_optional:      '(optional)',
    label_cf_token:   'Cloudflare Tunnel Token (optional)',
    label_port_config: 'Port config (auto conflict detection)',
    btn_check_ports:  '🔍 Check port conflicts',
    btn_step2_back:   'Back',
    btn_step2_next:   'Next: Launch container',

    // Step 3
    step3_desc:       'Starting webcode container, first run will pull the image (~2–5 min)…',
    btn_step3_back:   'Back to config',
    btn_step3_next:   'Enter workspace →',

    // Step 4
    step4_desc:       'Config loaded, container not running.',
    btn_step4_start:  '▶ Start container',
    btn_step4_config: 'Edit config',
    btn_step4_enter:  'Enter workspace',

    // Workspace tabs
    tab_status:       'Status',
    tab_vnc:          'Desktop',
    tab_ide:          'IDE',
    tab_kanban:       'Kanban',
    tab_ai:           'AI',
    title_refresh:    'Refresh',
    title_open_browser: 'Open in browser',
    status_detecting: 'Detecting…',
    btn_restart:      'Restart',
    btn_stop:         'Stop',

    // Status panel
    h_container_status: 'Container status',
    state_unknown:    'Unknown',
    h_config:         'Config',
    label_run_mode_ws: 'Run mode',
    mode_desktop_short: '🖥 Desktop',
    mode_lite_short:  '⚡ Lite',
    label_port_config_ws: 'Port config',
    btn_save_config:  'Save config',
    btn_save_restart: 'Save & restart',
    h_container_logs: 'Container logs',

    // Theme switcher
    theme_dark:   'Dark',
    theme_light:  'Light',
    theme_system: 'System',

    // Dynamic strings
    dyn_not_found:    'Not found',
    dyn_running:      'Running',
    dyn_not_running:  'Not running',
    dyn_stopped:      'Stopped',
    dyn_launch_ok:    '\n✓ Container started successfully!\n',
    dyn_launch_fail:  '\n✗ Launch failed (exit {code})\n',
    dyn_relaunch_ok:  '\n✓ Started successfully!\n',
    dyn_confirm_restart: 'Restart the container?',
    dyn_confirm_stop:    'Stop the container?',
    dyn_port_conflict:   'Port conflict detected! Auto-fix?',
    dyn_port_occupied:   '  - {name} port {port} is occupied',
    dyn_port_fixed:   'Ports adjusted. Save config to apply.',
    dyn_port_ok:      'All ports available!',
    dyn_config_saved: 'Config saved. Restart container to apply changes.',
    // Issue 4: Restart feedback
    dyn_restarting:   'Restarting…',
    dyn_stopping:     'Stopping…',
    // Process restart related
    title_restart_process:     'Restart process',
    title_view_logs:           'View logs',
    dyn_confirm_restart_process: 'Restart process {name}?',
    dyn_restart_failed:        'Restart failed (exit {code})',
    dyn_loading_logs:          'Loading logs…',
    dyn_logs_for_process:      '{name} logs:',
    // Block titles
    adv_title_run_mode:   'Run mode',
    adv_title_auth:       'Authentication',
    adv_title_git:        'Git config',
    adv_title_cloudflare: 'Cloudflare Tunnel',
    // Custom volumes & port mapping
    label_volumes:    'Custom volume mounts',
    btn_add_volume:   '+ Add mount',
    btn_add_port_map: '+ Add port',
    adv_title_ports:        'Port config',
    adv_title_volumes:      'Volume mounts',
    adv_sub_custom_ports:   'Custom port mapping',
    adv_sub_custom_volumes: 'Custom volume mounts',
    label_host:       'Host',
    label_container:  'Container',
    ph_host_path:     'Host path or volume name',
    ph_container_path: 'Container path',
    btn_pick_dir:     'Pick folder',
    label_named_volumes: 'Named volumes',
    // Issue 6: Supervisor status
    h_supervisor_status: 'Process status',
    // Issue 7: Cloudflare guide
    cf_help_text:     'How to get a Token?',
    cf_help_link:     'Cloudflare Zero Trust dashboard',
    cf_help_steps:    ' → Networks → Tunnels → Create Tunnel → Copy token',
    // Clear volume
    btn_clear_vol:    'Clear',
    dyn_confirm_clear_vol: 'Clear volume {name}?\nThis will permanently delete all data and cannot be undone.\n\nThe container will be stopped automatically. You will need to restart it afterwards.',
  },
};

// ── State ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'webcode-lang';

function detectLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && translations[stored]) return stored;
  } catch (e) {}
  const nav = (navigator.language || 'zh-CN');
  if (nav.startsWith('zh')) return 'zh-CN';
  return 'en';
}

let currentLang = detectLang();

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Translate a key, optionally interpolating {param} placeholders.
 * @param {string} key
 * @param {Object} [params]
 * @returns {string}
 */
function t(key, params) {
  const dict = translations[currentLang] || translations['zh-CN'];
  let str = (dict && dict[key] !== undefined) ? dict[key]
          : (translations['zh-CN'][key] !== undefined ? translations['zh-CN'][key] : key);
  if (params) {
    Object.keys(params).forEach(k => {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), String(params[k]));
    });
  }
  return str;
}

/**
 * Switch language and re-apply translations to the DOM.
 * @param {string} lang  e.g. 'zh-CN' | 'en'
 */
function setLang(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  // DOM 更新由调用方负责（index.html 中的 applyTranslations），
  // 避免在 Node 模块上下文访问 document 可能引发的问题。
}

/** Return the current language code. */
function getLang() { return currentLang; }

/**
 * Walk the DOM and apply translations to all annotated elements.
 * Attributes recognised:
 *   data-i18n             → element.textContent
 *   data-i18n-title       → element.title
 *   data-i18n-placeholder → element.placeholder
 */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });

  // Sync language toggle buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === currentLang);
  });

  // Update <html lang="…">
  document.documentElement.lang = currentLang;
}

module.exports = { t, setLang, getLang, applyTranslations };
