/* =========================================================
 * main.js —— 应用控制器：登录/路由/导航/主题/账号设置
 * ========================================================= */
(function (global) {
  'use strict';
  // 共享 App 对象（teacher/student/parent 已通过 global.App = global.App||{} 引用同一对象）
  var App = global.App = global.App || {};
  App.user = null;

  // 教师当前选中班级（持久化，避免多个班级时切换混乱）
  var CKEY = 'mathai_current_class_v1';
  App.currentClassId = localStorage.getItem(CKEY) || null;
  App.setCurrentClass = function(id){ App.currentClassId = id || null; if(App.currentClassId) localStorage.setItem(CKEY, App.currentClassId); else localStorage.removeItem(CKEY); };

  var NAV = {
    teacher: [
      {r:'home',label:'概览',icon:'🏠'},
      {r:'class',label:'班级管理',icon:'👥'},
      {r:'grade',label:'AI批改',icon:'✅'},
      {r:'bank',label:'题库',icon:'📚'},
      {r:'analytics',label:'学情分析',icon:'📈'}
    ],
    student: [
      {r:'home',label:'首页',icon:'🏠'},
      {r:'practice',label:'练习',icon:'✏️'},
      {r:'wrong',label:'错题本',icon:'📒'},
      {r:'report',label:'报告',icon:'📊'}
    ],
    parent: [
      {r:'home',label:'首页',icon:'🏠'},
      {r:'report',label:'学习报告',icon:'📊'},
      {r:'wrong',label:'错题辅导',icon:'📒'},
      {r:'advice',label:'辅导建议',icon:'🤖'}
    ]
  };

  /* ---------- 启动 ---------- */
  document.addEventListener('DOMContentLoaded', init);
  async function init(){
    registerSW();
    wireInstall();
    wireAuth();
    wireSyncBtn();
    // 初始化云端（未配置则自动降级本地模式）
    try{ await CB.init(); }catch(e){}
    if(CB.enabled){
      try{ await DB.syncFromCloud(); }catch(e){}
    }
    startAutoSync();        // 后台定时从云端拉取并自动重绘，解决"多设备不及时同步"
    renderCloudStatus();   // 在登录页直接显示云端连接状态与失败原因
    updateSyncHint();
    var s=DB.getSession();
    if(s){ var db=DB.get(); var u=DB.byId(db.users, s.uid);
      if(u){ App.user=u; enterApp(); return; } }
    showAuth();
  }
  /* 渲染云端同步状态条（登录页可见，直接显示连接/故障原因） */
  function renderCloudStatus(){
    var el = document.getElementById('cloud-status');
    if(!el || !global.CB || !CB.diagnose) return;
    var d = CB.diagnose();
    el.className = 'cloud-status ' + (d.ok ? 'ok' : 'bad');
    var raw = d.rawError ? '<code class="raw-err" title="原始错误">'+d.rawError.replace(/</g,'&lt;')+'</code>' : '';
    var btns = d.ok ? '' : ' <span class="status-btns"><button type="button" id="btn-retry-cloud" class="btn-text">重试</button>' + (d.rawError ? '<button type="button" id="btn-copy-err" class="btn-text">复制详情</button></span>' : '</span>');
    el.innerHTML = '<b>'+d.title+'</b>' + (d.detail ? '<span>'+d.detail+'</span>' : '') + raw + btns;
    var btn = document.getElementById('btn-retry-cloud');
    if(btn) btn.onclick = async function(){
      btn.textContent = '连接中…';
      try{ await CB.retry(); }catch(e){}
      if(CB.enabled) try{ await DB.syncFromCloud(); }catch(e){}
      renderCloudStatus();
      updateSyncHint();
    };
    var copyBtn = document.getElementById('btn-copy-err');
    if(copyBtn) copyBtn.onclick = async function(){
      try{ await navigator.clipboard.writeText(d.rawError); copyBtn.textContent='已复制'; setTimeout(function(){copyBtn.textContent='复制详情';},1500); }catch(e){ copyBtn.textContent='复制失败'; }
    };
  }

  /* 实时同步：后台每 AUTO_SYNC_MS 从云端拉取并合并，发现数据变化就重绘当前页，
   * 让教师/家长端能"实时"看到学生刚提交的作业，而不是必须重启/刷新页面。 */
  var AUTO_SYNC_MS = 10000;
  function startAutoSync(){
    if(!global.CB || !CB.enabled) return;
    if(global.__autoSyncStarted) return;
    global.__autoSyncStarted = true;
    setInterval(async function(){
      try{
        if(document.querySelector('.modal-mask')) return;   // 弹窗打开时不打断用户
        var r = await DB.syncFromCloud();
        if(r && r.changed && App.user) App.render();          // 有变化才重绘，避免无谓闪烁
        if(r && r.ok) updateSyncHint();
      }catch(e){}
    }, AUTO_SYNC_MS);
  }
  // 顶部"🔄 同步"按钮：立即从云端拉取一次。
  // 5 秒内连续点击两次，第二次强制以云端为准（丢弃本地对同步集合的修改），用于紧急恢复。
  function wireSyncBtn(){
    var btn = document.getElementById('btn-sync');
    if(!btn) return;
    var lastClick = 0, forceHint = false;
    btn.onclick = async function(){
      if(!(global.CB && CB.enabled)){ UI.toast('当前未连接云端（本机模式），无法同步', 2600); return; }
      var now = Date.now();
      var force = (now - lastClick < 5000);
      lastClick = now;
      var old = btn.textContent; btn.disabled = true; btn.textContent = force ? '强制同步中…' : '同步中…';
      try{
        var r = force ? await DB.forcePullFromCloud() : await DB.syncFromCloud();
        if(r && r.changed && App.user) App.render();
        // 每次手动同步都顺带做一次「云端写入自检」——确诊本设备能否写云端（权限问题一次看清）
        var w = await DB.testCloudWrite();
        if(!w.ok){
          UI.toast('⚠️ 拉取成功，但本设备无法写入云端！\n' + w.msg, 8000);
        } else if(force && r && r.ok){
          UI.toast(r.changed ? '已强制以云端为准刷新（写入自检 ✅）' : '强制同步完成，与云端一致（写入自检 ✅）', 3000);
        } else {
          UI.toast(r && r.ok ? (r.changed ? '已同步，发现新数据（写入自检 ✅）' : '已同步，数据已是最新（写入自检 ✅）') : '同步失败：'+((CB.syncError)||'请检查网络'), 3000);
        }
      }catch(e){ UI.toast('同步失败，请检查网络', 2600); }
      finally{ btn.disabled = false; btn.textContent = old; updateSyncHint(); }
    };
  }
  // 在按钮 title 中显示最后同步时间，方便诊断
  function updateSyncHint(){
    var btn = document.getElementById('btn-sync');
    if(!btn) return;
    var t = localStorage.getItem('mathai_db_v1_last_sync');
    var base = '点击拉取云端最新数据；5 秒内连点两次强制以云端为准';
    btn.title = t ? base + '\n最后成功同步：' + new Date(+t).toLocaleString('zh-CN') : base;
  }

  function registerSW(){
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('sw.js').then(function(reg){
        console.log('[SW] registered', reg.scope);
      }).catch(function(err){
        console.warn('[SW] registration failed', err);
      });
    }
  }
  var deferredPrompt = null;
  function wireInstall(){
    window.addEventListener('beforeinstallprompt', function(e){
      e.preventDefault();
      deferredPrompt = e;
      var banner = document.getElementById('install-banner');
      if(banner) banner.classList.add('show');
    });
    var btn = document.getElementById('btn-install');
    if(btn) btn.onclick = function(){
      if(!deferredPrompt){ UI.toast('当前设备/浏览器暂不支持直接安装，请用浏览器菜单“添加到主屏/桌面”'); return; }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(choice){
        if(choice.outcome === 'accepted'){
          UI.toast('已添加到桌面/主屏');
        }
        var banner = document.getElementById('install-banner');
        if(banner) banner.classList.remove('show');
        deferredPrompt = null;
      });
    };
  }

  /* ---------- 认证屏 ---------- */
  function showAuth(){
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('hidden');
    document.body.className='theme-login';
  }
  function wireAuth(){
    var tabs=document.querySelectorAll('.auth-tab');
    tabs.forEach(function(t){ t.onclick=function(){ tabs.forEach(function(x){x.classList.remove('active');}); t.classList.add('active');
      ['login','register','reset'].forEach(function(n){ document.getElementById('form-'+n).classList.toggle('active', n===t.dataset.tab); }); }; });
    // 演示账号
    document.querySelectorAll('.chip[data-role]').forEach(function(c){ c.onclick=function(){ var role=c.dataset.role;
      var map={teacher:'13800000001',student:'13800000011',parent:'13800000021'};
      document.getElementById('login-phone').value=map[role]; document.getElementById('login-role').value=role;
      tabs.forEach(function(x){x.classList.remove('active');}); document.querySelector('.auth-tab[data-tab="login"]').classList.add('active');
      ['login','register','reset'].forEach(function(n){ document.getElementById('form-'+n).classList.toggle('active', n==='login'); });
    }; });
    // 注册身份联动
    var regRole=document.getElementById('reg-role');
    regRole.onchange=function(){ renderRegExtra(regRole.value); };
    // 提交
    document.getElementById('form-login').onsubmit=async function(e){ e.preventDefault();
      var btn=this.querySelector('button[type=submit]'); if(btn) btn.disabled=true;
      var r=await Auth.login(document.getElementById('login-phone').value, document.getElementById('login-pwd').value, document.getElementById('login-role').value);
      document.getElementById('login-hint').textContent=r.ok?'':r.msg;
      if(r.ok){ App.user=r.user; enterApp(); } else { if(btn) btn.disabled=false; } };
    document.getElementById('form-register').onsubmit=async function(e){ e.preventDefault();
      var btn=this.querySelector('button[type=submit]'); if(btn) btn.disabled=true;
      var d={ role:regRole.value, name:val('reg-name'), phone:val('reg-phone'), pwd:val('reg-pwd'), pwd2:val('reg-pwd2'),
        studentNo:val('reg-stuno'), school:val('reg-school') };
      var r=await Auth.register(d); document.getElementById('reg-hint').textContent=r.ok?'':r.msg;
      if(r.ok){ App.user=r.user; enterApp(); } else { if(btn) btn.disabled=false; } };
    document.getElementById('form-reset').onsubmit=async function(e){ e.preventDefault();
      var r=await Auth.resetPwd(document.getElementById('reset-phone').value, document.getElementById('reset-pwd').value);
      document.getElementById('reset-hint').textContent=r.msg; };
  }
  function renderRegExtra(role){
    var box=document.getElementById('reg-extra'); var h='';
    if(role==='student') h='学号<input id="reg-stuno" placeholder="选填">';
    if(role==='teacher') h='学校<input id="reg-school" placeholder="选填">';
    box.innerHTML=h;
  }
  function val(id){ var e=document.getElementById(id); return e?e.value.trim():''; }

  /* ---------- 进入应用 ---------- */
  function enterApp(){
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    document.body.className='theme-'+App.user.role;
    document.getElementById('cur-user').textContent=App.user.name+'（'+Auth.roleName(App.user.role)+'）';
    document.getElementById('btn-logout').onclick=logout;
    document.getElementById('btn-menu').onclick=function(){ document.getElementById('sidebar').classList.toggle('open'); };
    if(!location.hash || location.hash==='#') location.hash='#/'+App.user.role+'/home';
    if(!window.__hashBound){ window.addEventListener('hashchange', render); window.__hashBound=true; }
    // 未连云端时提示（避免以为数据已同步）
    if(global.CB && CB.diagnose && !CB.diagnose().ok){
      UI.toast('⚠️ '+CB.diagnose().title+'：'+CB.diagnose().detail, 4200);
    }
    render();
  }
  function logout(){ UI.confirm('确定退出登录？', function(){ DB.clearSession(); App.user=null; App.setCurrentClass(null); location.hash=''; showAuth(); }); }

  /* ---------- 路由 / 渲染 ---------- */
  App.go=function(h){ location.hash=h; };
  App.render=render;
  function render(){
    var parts=location.hash.replace(/^#\//,'').split('/'); // [role, sub?query]
    var role=parts[0], sub=(parts[1]||'home').split('?')[0];
    if(role!==App.user.role){ // 防止越权访问
      location.hash='#/'+App.user.role+'/home'; return;
    }
    renderNav(role, sub);
    var view;
    if(role==='teacher') view=Teacher.render(sub);
    else if(role==='student') view=Student.render(sub);
    else if(role==='parent') view=Parent.render(sub);
    document.getElementById('sidebar').classList.remove('open');
    document.title='小学数学AI助教 · '+Auth.roleName(role);
  }
  function renderNav(role, sub){
    var items=NAV[role].concat([{r:'settings',label:'账号设置',icon:'⚙️',action:openSettings}]);
    var sb=document.getElementById('sidebar'); var tb=document.getElementById('tabbar');
    sb.innerHTML=items.map(function(it){ return navHtml(it, sub, false); }).join('');
    tb.innerHTML=items.map(function(it){ return navHtml(it, sub, true); }).join('');
    // 绑定
    sb.querySelectorAll('.nav-item').forEach(bindNav);
    tb.querySelectorAll('.nav-item').forEach(bindNav);
  }
  function navHtml(it, sub, isTab){
    var active = (it.r===sub)?' active':'';
    var href = it.action? 'javascript:void(0)' : '#/'+App.user.role+'/'+it.r;
    var icon = isTab? '<span class="ico">'+it.icon+'</span>' : it.icon;
    return '<a class="nav-item'+active+'" href="'+href+'"'+(it.action?' data-action="1"':'')+'>'+icon+'<span>'+it.label+'</span></a>';
  }
  function bindNav(el){
    if(el.getAttribute('data-action')){ el.onclick=openSettings; }
  }

  /* ---------- 账号设置（密码重置 / 注销） ---------- */
  function openSettings(){
    var u=App.user;
    var body='<p class="muted">身份：'+Auth.roleName(u.role)+' | 手机号：'+(u.phone||'—')+' | ID：'+(u.id||'—')+'</p>'+
      '<div style="margin-bottom:10px">修改密码</div>原密码 <input id="st-old" type="password"><br><br>新密码 <input id="st-new" type="password" placeholder="6-20位"><br><br><button class="btn btn-primary" id="st-save">保存密码</button>'+
      '<hr style="margin:16px 0;border:none;border-top:1px solid var(--line)"><div style="margin-bottom:8px">账号注销</div><span class="muted">注销将删除您的账号及关联数据，不可恢复。</span><br><br><button class="btn btn-danger" id="st-del">注销账号</button>';
    UI.modal({ title:'账号设置 · '+App.user.name, body:body, actions:[{label:'关闭',cls:''}], dismissable:true });
    document.getElementById('st-save').onclick=function(){ var db=DB.get(); var u=DB.byId(db.users,App.user.id);
      if(u.pwd!==document.getElementById('st-old').value){ UI.toast('原密码错误'); return; }
      var np=document.getElementById('st-new').value; if(np.length<6){ UI.toast('新密码至少6位'); return; }
      u.pwd=np; DB.save(db); UI.toast('密码已修改'); document.querySelector('.modal-mask').remove(); };
    document.getElementById('st-del').onclick=function(){ UI.confirm('确认注销账号？此操作不可恢复。', function(){ Auth.deleteAccount(App.user.id); DB.clearSession(); App.user=null; location.hash=''; document.querySelector('.modal-mask').remove(); showAuth(); }); };
  }

})(window);
