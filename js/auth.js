/* =========================================================
 * auth.js —— 注册 / 登录 / 密码重置 / 账号注销
 * 双模式：
 *  - cloud（已配置 CloudBase）：业务身份认证走 CloudBase 用户名密码登录，
 *    手机号即 username，uid 跨设备稳定 → 电脑/手机/平板数据互通。
 *  - local（未配置）：沿用原 localStorage 账号。
 * 设计：教师先在教师端"导入学生"把手机号写进云端 users；
 *       学生/家长用同一手机号自行注册 CloudBase 账号后登录，复用同一业务身份。
 * ========================================================= */
(function (global) {
  'use strict';

  function validPhone(p){ return /^1\d{10}$/.test(p); }
  function roleName(r){ return r==='teacher'?'教师':r==='student'?'学生':'家长'; }
  function cloudMode(){ return !!(global.CB && CB.enabled); }

  /* ---------- 登录 ---------- */
  async function login(phone, pwd, role){
    if(!validPhone(phone)) return { ok:false, msg:'请输入正确的11位手机号' };
    if(!pwd) return { ok:false, msg:'请输入密码' };

    if(cloudMode()){
      // 云端账号由本应用自行管理（手机号+密码，存于 sync 集合），无需 CloudBase 注册
      try{ await DB.syncFromCloud(); }catch(e){}
      var db=DB.get();
      var u=DB.byPhone(db.users, phone);
      if(!u) return { ok:false, msg:'该手机号未注册，请先注册（或联系教师在教师端导入）' };
      if(u.role!==role) return { ok:false, msg:'该账号不是'+roleName(role)+'身份，请切换身份登录' };
      if(!u.pwd){ u.pwd=pwd; DB.save(db); }        // 教师导入未设密码时，首次登录即设置
      else if(u.pwd!==pwd) return { ok:false, msg:'密码错误' };
      DB.setSession(u);
      return { ok:true, msg:'登录成功', user:u };
    }

    // 本地模式
    var db2=DB.get();
    var u2=DB.byPhone(db2.users, phone);
    if(!u2) return { ok:false, msg:'该手机号未注册' };
    if(u2.pwd!==pwd) return { ok:false, msg:'密码错误' };
    if(u2.role!==role) return { ok:false, msg:'该账号不是'+roleName(role)+'身份，请切换身份登录' };
    DB.setSession(u2);
    return { ok:true, msg:'登录成功', user:u2 };
  }

  /* ---------- 注册 ---------- */
  async function register(d){
    if(!d.name) return { ok:false, msg:'请填写姓名' };
    if(!validPhone(d.phone)) return { ok:false, msg:'手机号格式不正确' };
    if(!d.pwd || d.pwd.length<6) return { ok:false, msg:'密码至少6位' };
    if(d.pwd!==d.pwd2) return { ok:false, msg:'两次密码不一致' };

    // 云端模式下，注册前必须拉取最新云端数据，防止覆盖教师已导入的账号
    if(cloudMode()){
      try{ await DB.syncFromCloud(); }catch(e){}
    }
    var db=DB.get();
    var exist=DB.byPhone(db.users, d.phone);

    if(cloudMode()){
      // 云端账号由本应用自行管理，手机号全局唯一：教师导入的账号与学生自注册账号必须一致
      if(exist){
        if(exist.role===d.role) return { ok:false, msg:'该手机号已注册，请直接登录。如忘记密码，可用“重置密码”。' };
        return { ok:false, msg:'该手机号已被'+roleName(exist.role)+'占用，无法注册为'+roleName(d.role)+'。' };
      }
      var u={ id:DB.uid(d.role[0]), role:d.role, name:d.name, phone:d.phone, pwd:d.pwd };
      if(d.role==='student'){ u.studentNo=d.studentNo||('S'+Date.now().toString().slice(-6)); u.grade=3; u.points=0; }
      if(d.role==='parent'){ u.studentId=null; }
      if(d.role==='teacher'){ u.school=d.school||''; }
      db.users.push(u);
      if(d.role==='student') db.students.push(u);
      if(d.role==='parent') db.parents.push(u);
      DB.save(db);
      DB.setSession(u);
      return { ok:true, msg:'注册成功', user:u };
    }

    // 本地模式
    if(exist) return { ok:false, msg:'该手机号已注册' };
    var u2={ id:DB.uid(d.role[0]), role:d.role, name:d.name, phone:d.phone, pwd:d.pwd };
    if(d.role==='student'){ u2.studentNo=d.studentNo||('S'+Date.now().toString().slice(-6)); u2.grade=3; u2.points=0; }
    if(d.role==='parent'){ u2.studentId=null; }
    if(d.role==='teacher'){ u2.school=d.school||''; }
    db.users.push(u2);
    if(d.role==='student') db.students.push(u2);
    if(d.role==='parent') db.parents.push(u2);
    DB.save(db);
    DB.setSession(u2);
    return { ok:true, msg:'注册成功', user:u2 };
  }

  /* ---------- 密码重置 ---------- */
  async function resetPwd(phone, newPwd){
    if(!validPhone(phone)) return { ok:false, msg:'手机号格式不正确' };
    if(!newPwd || newPwd.length<6) return { ok:false, msg:'新密码至少6位' };
    if(cloudMode()){
      try{ await DB.syncFromCloud(); }catch(e){}
      var db=DB.get();
      var u=DB.byPhone(db.users, phone);
      if(!u) return { ok:false, msg:'该手机号未注册' };
      u.pwd=newPwd; DB.save(db);
      return { ok:true, msg:'密码已重置，请用新密码登录' };
    }
    var db=DB.get();
    var u=DB.byPhone(db.users, phone);
    if(!u) return { ok:false, msg:'该手机号未注册' };
    u.pwd=newPwd; DB.save(db);
    return { ok:true, msg:'密码已重置，请用新密码登录' };
  }

  /* ---------- 注销 ---------- */
  function deleteAccount(uid){
    var db=DB.get();
    var u=DB.byId(db.users, uid); if(!u) return;
    db.users=db.users.filter(function(x){return x.id!==uid;});
    db.students=db.students.filter(function(x){return x.id!==uid;});
    db.parents=db.parents.filter(function(x){return x.id!==uid;});
    if(u.role==='teacher'){ db.classes=db.classes.filter(function(c){return c.teacherId!==uid;}); }
    if(u.role==='student'){
      db.submissions=db.submissions.filter(function(s){return s.studentId!==uid;});
      db.wrongBook=db.wrongBook.filter(function(w){return w.studentId!==uid;});
      db.parents.forEach(function(p){ if(p.studentId===uid) p.studentId=null; });
    }
    DB.save(db);
  }

  global.Auth = { login:login, register:register, resetPwd:resetPwd, deleteAccount:deleteAccount, validPhone:validPhone, roleName:roleName };
})(window);
