/* =========================================================
 * cloudbase.js —— CloudBase Web SDK 接入层
 * 在 index.html 中先于 db.js / auth.js 引入本文件与 SDK。
 *
 * 【配置】把下方 ENV_ID 改成您在 CloudBase 控制台创建的环境 ID。
 *   位置：CloudBase 控制台 → 环境 → 环境设置 → 环境 ID（形如 xxxx-envId）
 *   未填写 / 填错时自动降级为「本地模式」（localStorage），页面照常可用。
 *
 * 设计要点：
 *  - 用 CloudBase「用户名密码登录」做业务身份认证（手机号=username），
 *    uid 跨设备稳定 → 实现电脑/手机/平板数据互通。
 *  - 匿名登录作为基础登录态，仅用于满足安全规则 auth != null。
 *  - 数据同步交由 db.js（集合级整体快照，极省调用次数）。
 * ========================================================= */
(function (global) {
  'use strict';

  /* ====== 👇 请在此填入您的 CloudBase 环境 ID ====== */
  var ENV_ID = 'YOUR_CLOUDBASE_ENV_ID';
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

  /* 幂等初始化：尝试连接 CloudBase，失败则降级本地模式 */
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
        await CB.auth.signInAnonymously();   // 基础登录态
        CB.enabled = true;
        console.log('[CloudBase] 已启用，环境 =', ENV_ID);
        return true;
      } catch (e) {
        console.warn('[CloudBase] 初始化失败，降级本地模式：', e && e.message);
        CB.enabled = false; return false;
      }
    })();
    return CB._ready;
  };

  CB.coll = function (name) { return CB.app.database().collection(name); };

  /* —— 业务身份认证（用户名密码登录，手机号规范为 username）—— */
  // 统一把手机号转成合法用户名（兼容控制台"任意用户名"或"邮箱格式用户名"两种配置）
  function toUser(phone){ return /@/.test(phone) ? phone : (phone + '@math.local'); }
  CB.toUser = toUser;
  CB.signUp = async function (phone, pwd) {
    await CB.auth.signUpWithUsernameAndPassword(toUser(phone), pwd);
    return await CB.auth.getLoginState();
  };
  CB.signIn = async function (phone, pwd) {
    await CB.auth.signInWithUsernameAndPassword(toUser(phone), pwd);
    return await CB.auth.getLoginState();
  };
  CB.signOut = async function () { try { await CB.auth.signOut(); } catch (e) {} };

  /* 当前登录用户的稳定 uid（用于安全规则，不用于业务隔离） */
  CB.getUid = async function () {
    try { var st = await CB.auth.getLoginState(); return (st && st.user) ? st.user.uid : null; }
    catch (e) { return null; }
  };

  /* 确保有匿名登录态（写操作需要 auth != null） */
  CB.ensureAnon = async function () {
    if (!CB.enabled) return;
    try {
      var st = await CB.auth.getLoginState();
      if (!st || !st.user) await CB.auth.signInAnonymously();
    } catch (e) {
      try { await CB.auth.signInAnonymously(); } catch (e2) {}
    }
  };

  CB.mode = function () { return CB.enabled ? 'cloud' : 'local'; };

  global.CB = CB;
})(window);
