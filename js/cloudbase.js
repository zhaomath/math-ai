/* =========================================================
 * cloudbase.js —— CloudBase Web SDK 接入层（v1 经典版）
 *
 * 【配置】把下方 ENV_ID 改成您在 CloudBase 控制台创建的环境 ID。
 *   位置：CloudBase 控制台 → 环境 → 环境设置 → 环境 ID（形如 xxxx-envId）
 *   未填写 / 填错时自动降级为「本地模式」（localStorage），页面照常可用。
 *
 * 设计要点（针对新环境 + 真实班级使用，最稳、最简单）：
 *  - 新环境不支持「用户名+密码直接注册」，所以本应用不依赖 CloudBase 账号体系。
 *  - 仅用 CloudBase「匿名登录」满足数据库安全规则 auth != null，从而可读写共享集合。
 *  - 教师/学生/家长账号（手机号+密码）完全由本应用自行管理，存在云端 sync 集合里，
 *    跨电脑/手机/平板完全一致。控制台只需做 3 步（建环境、开匿名登录、建 sync 集合+规则）。
 *  - 安全规则 auth != null 即可，无需 accessKey / 短信验证，零额外成本。
 * ========================================================= */
(function (global) {
  'use strict';

  /* ====== 👇 请在此填入您的 CloudBase 环境 ID ====== */
  var ENV_ID = 'math-ai-1gabcde123';
  /* =================================================== */

  var CB = {
    enabled: false,
    app: null,
    auth: null,
    _ready: null,
    ENV_ID: ENV_ID,
    lastError: '',   // 初始化失败原因（友好中文）
    syncError: ''    // 读写 sync 集合失败原因
  };

  /* 把 CloudBase 原始报错翻译成老师能看懂的中文
   * 优先级：环境ID错误 > 匿名登录未开 > 集合/权限 > 网络 > 其它
   * 注意：env 初始化失败的报错里可能同时含 "auth"，所以环境判断要放最前。
   */
  function friendlyErr(e){
    var raw = (e && (e.message || e.errMsg || '')) + ' ' + (e && e.code ? String(e.code) : '');
    var m = raw.toLowerCase();
    if(/envid|env id|environment|invalid.*env|illegal.*env|not found|no such|no env|不存在该环境|格式|非法|parse error|environmentid|env_id/.test(m))
      return '环境ID可能不正确，请核对控制台“环境ID”（通常只需前半段，如 math-ai-1gabcde123）';
    if(/anonymous|anonymous login|匿名登录|signin anonymously/.test(m))
      return '匿名登录未开启，请在控制台【身份认证 → 登录方式】打开“匿名登录”开关';
    if(/unauthorized|鉴权|permission denied|not authorized|insufficient privilege|privilege/.test(m))
      return '数据库集合 sync 不存在，或安全规则未设为 auth != null';
    if(/collection|database|sync|安全|rule/.test(m))
      return '数据库集合 sync 不存在，或安全规则未设为 auth != null';
    if(/network|timeout|网络|超时|econn|fail|offline|disconnected/.test(m))
      return '网络异常，请检查网络后刷新重试';
    return '云端连接失败：' + (raw.trim() || '未知原因') + '（可在浏览器 F12 控制台查看详情）';
  }

  /* 动态加载浏览器版 CloudBase SDK（v1 ESM，jsDelivr +esm 转译，国内可访问；失败回退 esm.sh） */
  function loadSDK() {
    var sources = [
      'https://cdn.jsdelivr.net/npm/@cloudbase/js-sdk@1/+esm',
      'https://esm.sh/@cloudbase/js-sdk@1'
    ];
    return (async function () {
      var lastErr;
      for (var i = 0; i < sources.length; i++) {
        try {
          var mod = await import(sources[i]);   // 浏览器原生动态 import ESM
          var sdk = mod && (mod.default || mod);
          if (sdk && typeof sdk.init === 'function') return sdk;
        } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error('SDK 加载失败');
    })();
  }

  function hasEnv(){
    return !!ENV_ID && ENV_ID.indexOf('YOUR_') !== 0 && ENV_ID.length > 4;
  }

  /* 幂等初始化：连接 CloudBase 并匿名登录（满足 auth != null） */
  CB.init = function () {
    if (CB._ready) return CB._ready;
    CB._ready = (async function () {
      CB.lastError = '';
      if (!hasEnv()) {
        CB.lastError = '未配置云端环境（ENV_ID 仍是占位符）';
        console.warn('[CloudBase] 未配置 ENV_ID，使用本地模式');
        CB.enabled = false; return false;
      }
      var sdk;
      try {
        sdk = await loadSDK();
      } catch (e) {
        CB.lastError = 'CloudBase SDK 加载失败（CDN/网络问题，可换网络或稍后重试）';
        console.warn('[CloudBase] SDK 动态加载失败，降级本地模式：', e && e.message);
        CB.enabled = false; return false;
      }
      try {
        CB.app = sdk.init({ env: ENV_ID });
        CB.auth = CB.app.auth();
        await CB.auth.signInAnonymously();   // 基础登录态，满足数据库安全规则 auth != null
        CB.enabled = true;
        CB.lastError = '';
        console.log('[CloudBase] 已启用（匿名登录），环境 =', ENV_ID);
        return true;
      } catch (e) {
        // 匿名登录未开启或失败 → 降级本地模式（跨设备不同步，但页面照常可用）
        CB.enabled = false;
        CB.lastError = friendlyErr(e);
        console.warn('[CloudBase] 初始化/匿名登录失败，降级本地模式：', e && e.message);
        return false;
      }
    })();
    return CB._ready;
  };

  CB.coll = function (name) { return CB.app.database().collection(name); };

  /* 重置并重新尝试连接云端（供界面“重试”按钮调用） */
  CB.retry = async function () {
    CB._ready = null;
    CB.enabled = false;
    CB.lastError = '';
    CB.syncError = '';
    return await CB.init();
  };

  /* 诊断当前同步状态，供界面显示 */
  CB.diagnose = function () {
    if (CB.enabled) {
      return { ok:true, mode:'cloud', title:'☁️ 云端已连接', detail:'多设备数据同步已开启' };
    }
    var detail = CB.lastError || (CB.syncError || '未连接云端，当前仅本机数据，不跨设备');
    return { ok:false, mode:'local', title:'💾 本机模式', detail:detail };
  };

  CB.mode = function () { return CB.enabled ? 'cloud' : 'local'; };

  global.CB = CB;
})(window);
