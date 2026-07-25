/* =========================================================
 * auth.js —— 注册 / 登录 / 密码重置 / 账号注销
 * ========================================================= */
(function (global) {
  'use strict';

  function validPhone(p){ return /^1\d{10}$/.test(p); }

  function login(phone, pwd, role){
    if(!validPhone(phone)) return { ok:false, msg:'请输入正确的11位手机号' };
    if(!pwd) return { ok:false, msg:'请输入密码' };
    var db=DB.get();
    var u=DB.byPhone(db.users, phone);
    if(!u) return { ok:false, msg:'该手机号未注册' };
    if(u.pwd!==pwd) return { ok:false, msg:'密码错误' };
    if(u.role!==role) return { ok:false, msg:'该账号不是'+roleName(role)+'身份，请切换身份登录' };
    DB.setSession(u);
    return { ok:true, msg:'登录成功', user:u };
  }

  function register(d){
    // d: {role,name,phone,pwd,pwd2, studentNo?, classCode?, parentPhone?}
    if(!d.name) return { ok:false, msg:'请填写姓名' };
    if(!validPhone(d.phone)) return { ok:false, msg:'手机号格式不正确' };
    if(!d.pwd || d.pwd.length<6) return { ok:false, msg:'密码至少6位' };
    if(d.pwd!==d.pwd2) return { ok:false, msg:'两次密码不一致' };
    var db=DB.get();
    if(DB.byPhone(db.users, d.phone)) return { ok:false, msg:'该手机号已注册' };
    var u={ id:DB.uid(d.role[0]), role:d.role, name:d.name, phone:d.phone, pwd:d.pwd };
    if(d.role==='student'){
      u.studentNo=d.studentNo||('S'+Date.now().toString().slice(-6));
      u.grade=3; u.points=0;
    }
    if(d.role==='parent'){ u.studentId=null; }
    db.users.push(u);
    if(d.role==='student') db.students.push(u);
    if(d.role==='parent') db.parents.push(u);
    if(d.role==='teacher'){ u.school=d.school||''; }
    DB.save(db);
    DB.setSession(u);
    return { ok:true, msg:'注册成功', user:u };
  }

  function resetPwd(phone, newPwd){
    if(!validPhone(phone)) return { ok:false, msg:'手机号格式不正确' };
    if(!newPwd || newPwd.length<6) return { ok:false, msg:'新密码至少6位' };
    var db=DB.get();
    var u=DB.byPhone(db.users, phone);
    if(!u) return { ok:false, msg:'该手机号未注册' };
    u.pwd=newPwd; DB.save(db);
    return { ok:true, msg:'密码已重置，请用新密码登录' };
  }

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

  function roleName(r){ return r==='teacher'?'教师':r==='student'?'学生':'家长'; }

  global.Auth = { login:login, register:register, resetPwd:resetPwd, deleteAccount:deleteAccount, validPhone:validPhone, roleName:roleName };
})(window);
