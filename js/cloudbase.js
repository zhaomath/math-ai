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
  var ENV_ID = 'math-ai-1gabcde123-d1cgz20891cc0';
  /* =================================================== */

  var CB = {
    enabled: false,
    app: null,
    auth: null,
    _ready: null,
    ENV_ID: ENV_ID
  };

  function hasEnv(){
    return !!ENV_ID && ENV_ID.indexOf('YOUR_') !== 0 && ENV_ID.length > 4;
  }

  /* 幂等初始化：连接 CloudBase 并匿名登录（满足 auth != null） */
  CB.init = function () {
    if (CB._ready) return CB._ready;
    CB._ready = (async function () {
      if (!hasEnv()) {
        console.warn('[CloudBase] 未配置 ENV_ID，使用本地模式');
        CB.enabled = false; return false;
      }
      if (typeof cloudbase === 'undefined') {
        console.warn('[CloudBase] SDK 未加载，使用本地模式');
        CB.enabled = false; return false;
      }
      try {
        CB.app = cloudbase.init({ env: ENV_ID });
        CB.auth = CB.app.auth();
        await CB.auth.signInAnonymously();   // 基础登录态，满足数据库安全规则 auth != null
        CB.enabled = true;
        console.log('[CloudBase] 已启用（匿名登录），环境 =', ENV_ID);
        return true;
      } catch (e) {
        // 匿名登录未开启或失败 → 降级本地模式（跨设备不同步，但页面照常可用）
        console.warn('[CloudBase] 初始化/匿名登录失败，降级本地模式：', e && e.message);
        CB.enabled = false; return false;
      }
    })();
    return CB._ready;
  };

  CB.coll = function (name) { return CB.app.database().collection(name); };

  CB.mode = function () { return CB.enabled ? 'cloud' : 'local'; };

  global.CB = CB;
})(window);
