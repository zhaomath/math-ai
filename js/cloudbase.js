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
    appAuth: null,
    _ready: null,
    ENV_ID: ENV_ID,
    lastError: '',   // 初始化失败原因（友好中文）
    syncError: '',   // 读写 sync 集合失败原因
    _gw: null,       // 最近一次 CloudBase 网关真实响应（用于诊断被 SDK 吞掉的错误）
    _xhrPatched: false
  };

  /* 拦截 XMLHttpRequest，捕获 CloudBase 网关（tcb-api.tencentcloudapi.com）的真实
   * 响应体与状态码。SDK 会把 INVALID_APP_SIGN / 环境错误等真实报错吞成 "network request error"，
   * 这里把原始返回存下来，供状态条「复制详情」展示，方便精准排查。 */
  function patchXHR(){
    if(CB._xhrPatched || typeof global.XMLHttpRequest === 'undefined') return;
    var RealXHR = global.XMLHttpRequest;
    function WrappedXHR(){
      var x = new RealXHR();
      var self = this;
      var hs = { onload:null, onerror:null, onreadystatechange:null, ontimeout:null };
      // 透传普通方法
      ['open','setRequestHeader','getResponseHeader','getAllResponseHeaders','abort','overrideMimeType','send'].forEach(function(m){
        if(typeof x[m] === 'function') self[m] = function(){ return x[m].apply(x, arguments); };
      });
      // 透传可读写属性
      ['status','readyState','responseText','response','responseType','withCredentials','timeout','upload'].forEach(function(p){
        Object.defineProperty(self, p, { get:function(){ return x[p]; }, set:function(v){ x[p]=v; } });
      });
      // 捕获 SDK 设置的处理器
      ['onload','onerror','onreadystatechange','ontimeout'].forEach(function(ev){
        Object.defineProperty(self, ev, { get:function(){ return hs[ev]; }, set:function(fn){ hs[ev]=fn; } });
      });
      x.onload = function(){
        try {
          var u = self._url || '';
          if(/tcb-api\.tencentcloudapi\.com/.test(u)) {
            CB._gw = { status: x.status, body: (x.responseText || '').slice(0, 400), url: u };
          }
        } catch(e){}
        if(hs.onload) hs.onload();
      };
      x.onerror = function(e){ if(hs.onerror) hs.onerror(e); };
      x.ontimeout = function(e){ if(hs.ontimeout) hs.ontimeout(e); };
      x.onreadystatechange = function(){ if(hs.onreadystatechange) hs.onreadystatechange(); };
      // 覆盖 open 以记录 URL
      var _open = self.open;
      self.open = function(method, url){ self._url = url; return _open.call(self, method, url, true); };
    }
    global.XMLHttpRequest = WrappedXHR;
    CB._xhrPatched = true;
  }
  patchXHR();

  function origin(){ try { return location.origin; } catch(e){ return '当前页面'; } }

  // 已知白名单主机（与 CloudBase 控制台【WEB 安全域名】保持一致）
  var KNOWN_HOSTS = ['zhaomath.github.io', 'localhost', '127.0.0.1'];
  function hostInWhitelist(){
    try { return KNOWN_HOSTS.indexOf(location.hostname) !== -1; } catch(e){ return false; }
  }

  /* 把 CloudBase 原始报错翻译成老师能看懂的中文
   * 优先级：file:// 误用 > 环境ID错误 > 来源未授权(签名) > 匿名登录未开 > 集合/权限 > 网络 > 其它
   * 注意：env 初始化失败的报错里可能同时含 "auth"，所以环境判断要放最前。
   */
  function friendlyErr(e){
    // 用 file:// 直接双击打开，浏览器来源为 null，CloudBase 一律拒签，必须改用 http 访问
    if(typeof location!=='undefined' && location.protocol==='file:')
      return '请改用 http 访问：当前用 file:// 打开，CloudBase 会拒绝该来源。本地可执行「python -m http.server」后访问 http://localhost:8080，或打开已部署的 GitHub Pages 网址；并把该网址域名加入 CloudBase【环境 → 安全配置 → WEB 安全域名】。';
    var raw = (e && (e.message || e.errMsg || e.error || '')) + ' ' + (e && e.code ? String(e.code) : '');
    var m = raw.toLowerCase();
    // 网关真实返回（被 SDK 吞掉的错误），优先据其判断
    var gw = CB._gw && CB._gw.body ? CB._gw.body : '';
    var gwl = gw.toLowerCase();
    if(/invalid_app_sign|jwt must be provided|app_sign|signature|安全来源|非法来源|invalid source/.test(gwl))
      return '请求来源未授权：网关返回「' + gw.slice(0,120) + '」。请把访问域名「'+origin()+'」加入 CloudBase【环境 → 安全配置 → WEB 安全域名】并保存，等 1–3 分钟后再硬刷新（Ctrl+F5）；若用 file:// 打开也会失败，请用 http 访问。';
    if(/invalid_env|environment.*not.*exist|no such env|env.*not.*found|illegal env/.test(gwl))
      return '环境ID不正确（网关返回：'+gw.slice(0,120)+'），请到 CloudBase 控制台【环境 → 环境设置】复制完整环境 ID（形如 math-ai-xxxxxxxx-xxxxxxxx，不要截断）填入本文件 ENV_ID';
    if(/envid|env id|environment|invalid.*env|illegal.*env|not found|no such|no env|不存在该环境|格式|非法|parse error|environmentid|env_id/.test(m))
      return '环境ID可能不正确，请到 CloudBase 控制台【环境 → 环境设置】复制完整环境 ID（形如 math-ai-xxxxxxxx-xxxxxxxx，不要截断）';
    // 签名/来源被拒：网关返回 INVALID_APP_SIGN / jwt must be provided，根因是访问域名没加入「WEB 安全域名」
    if(/invalid_app_sign|jwt must be provided|app_sign|signature|安全来源|非法来源|invalid source|jwt/.test(m))
      return '请求来源未授权：请把访问域名「'+origin()+'」加入 CloudBase 控制台【环境 → 安全配置 → WEB 安全域名】后刷新；若用 file:// 直接打开也会失败，请用 http 访问（本地 python -m http.server 或部署后的网址）。';
    if(/anonymous login is disabled|anonymous login disabled|anonymous auth is disabled|anonymous.*disabled|未开启匿名登录|未开通匿名登录|匿名登录未开启|anonymous login not enabled|anonymous.*not.*open|请先开通匿名登录/.test(m))
      return '匿名登录未开启，请在控制台【身份认证 → 登录方式】打开“匿名登录”开关';
    if(/unauthorized|鉴权|permission denied|not authorized|insufficient privilege|privilege/.test(m))
      return '数据库集合 sync 不存在，或安全规则未设为 auth != null';
    if(/collection|database|sync|安全|rule/.test(m))
      return '数据库集合 sync 不存在，或安全规则未设为 auth != null';
    // 通用网络错误：CloudBase 真实错误常被 SDK 吞成 "network request error"
    if(/network|timeout|网络|超时|econn|fail|offline|disconnected|request error/.test(m)){
      // 优先判断：当前访问来源根本不在白名单（如局域网IP 192.168.x.x、其它域名）
      if(!hostInWhitelist())
        return '当前访问来源「'+origin()+'」不在 CloudBase 白名单。请改用 https://zhaomath.github.io/math-ai/ （手机/电脑用同一网址）或本地 http://localhost 打开；若必须用局域网IP（如 192.168.x.x:8080）访问，请把该IP也加入控制台【环境 → 安全配置 → WEB 安全域名】。';
      return '云端请求失败。若网络正常，多半是：①白名单刚保存尚未生效（等 1–3 分钟）；②浏览器/Service Worker 缓存了旧代码——请硬刷新（Ctrl+F5），或在 DevTools→Application→Service Workers 点「Unregister」后刷新；③确认打开的网址是 https://zhaomath.github.io/math-ai/（当前来源：'+origin()+'）。';
    }
    return '云端连接失败：' + (raw.trim() || '未知原因') + '（可在浏览器 F12 控制台查看详情）';
  }

  /* 记录原始错误，供状态条展示详情 */
  function setLastError(e){
    CB.lastError = friendlyErr(e);
    var gw = CB._gw ? (' [网关' + (CB._gw.status || '?') + ': ' + (CB._gw.body || '').slice(0, 240) + ']') : '';
    CB.rawError = (e && (e.message || e.errMsg || e.error || e.stack || '')) + (e && e.code ? ' [code:' + e.code + ']' : '') + gw;
    console.warn('[CloudBase] 原始错误：', CB.rawError, e);
    console.warn('[CloudBase] 诊断 → 来源:', location.origin, '| 协议:', location.protocol, '| 环境:', ENV_ID, '| 网关记录:', CB._gw);
  }

  /* 检查浏览器全局 CloudBase SDK（已由 index.html 通过 <script src="vendor/cloudbase.min.js"> 引入）
   * 该文件为官方 UMD 构建（v1.7.1，已本地化），暴露全局变量 window.cloudbase，含 signInAnonymously。 */
  function getSDK(){
    try {
      if (typeof cloudbase !== 'undefined' && cloudbase && typeof cloudbase.init === 'function') return cloudbase;
    } catch (e) {}
    return null;
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
      var sdk = getSDK();
      if (!sdk) {
        CB.lastError = 'CloudBase SDK 未加载（vendor/cloudbase.min.js 未引入或加载失败，请检查网络后刷新）';
        console.warn('[CloudBase] SDK 未加载，使用本地模式');
        CB.enabled = false; return false;
      }
      try {
        CB.app = sdk.init({ env: ENV_ID });
        CB.appAuth = CB.app.auth();
        await CB.appAuth.anonymousAuthProvider().signIn();   // 匿名登录，满足数据库安全规则 auth != null
        CB.enabled = true;
        CB.lastError = '';
        CB.rawError = '';
        console.log('[CloudBase] 已启用（匿名登录），环境 =', ENV_ID);
        return true;
      } catch (e) {
        // 匿名登录未开启或失败 → 降级本地模式（跨设备不同步，但页面照常可用）
        CB.enabled = false;
        setLastError(e);
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
    CB.rawError = '';
    CB.syncError = '';
    return await CB.init();
  };

  /* 诊断当前同步状态，供界面显示 */
  CB.diagnose = function () {
    if (CB.enabled) {
      return { ok:true, mode:'cloud', title:'☁️ 云端已连接', detail:'多设备数据同步已开启', rawError:'' };
    }
    var detail = CB.lastError || (CB.syncError || '未连接云端，当前仅本机数据，不跨设备');
    return { ok:false, mode:'local', title:'💾 本机模式', detail:detail, rawError:CB.rawError || '' };
  };

  CB.mode = function () { return CB.enabled ? 'cloud' : 'local'; };

  global.CB = CB;
})(window);
