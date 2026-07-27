/* =========================================================
 * teacher.js —— 教师端（橙色主题）
 * 班级管理 / AI作业批改 / 题库管理 / 学情分析
 * ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  function myClasses(){ var db=DB.get(); return db.classes.filter(function(c){return c.teacherId===App.user.id;}); }
  function myClass(){ return myClasses()[0] || null; }
  // 当前选中班级（优先 persisted currentClassId，否则第一个班级）
  function currentClass(){
    var list=myClasses();
    if(App.currentClassId){
      for(var i=0;i<list.length;i++) if(list[i].id===App.currentClassId) return list[i];
    }
    return list[0] || null;
  }
  function classSelector(c){
    var list=myClasses();
    if(list.length<=1) return '<div class="row" style="margin-bottom:8px"><b>班级：'+UI.esc((c||{}).name||'')+'</b></div>';
    var opts=list.map(function(x){ return '<option value="'+x.id+'"'+(x.id===App.currentClassId?' selected':'')+'>'+UI.esc(x.name)+'</option>'; }).join('');
    return '<div class="row" style="margin-bottom:8px"><label style="flex:1">切换班级 <select id="class-select">'+opts+'</select></label></div>';
  }
  // 双重保险取学生：班级 studentIds 数组 + 学生记录里的 classId
  function studentsOf(c,db){
    var ids={}, res=[];
    (c.studentIds||[]).forEach(function(id){ if(!ids[id]){ ids[id]=1; var s=DB.byId(db.students,id); if(s) res.push(s); } });
    db.students.forEach(function(s){ if(s.classId===c.id && !ids[s.id]){ ids[s.id]=1; res.push(s); } });
    return res;
  }

  function render(sub){
    sub = sub||'home';
    var html='';
    switch(sub){
      case 'home': return home();
      case 'class': return classMgmt();
      case 'grade': return grading();
      case 'bank': return bank();
      case 'analytics': return analytics();
      default: return home();
    }
  }

  /* ---------- 概览 ---------- */
  function home(){
    var c=currentClass(); if(!c) return noClass();
    var db=DB.get();
    var subs=db.submissions.filter(function(s){var h=DB.byId(db.homework,s.hwId);return h&&h.classId===c.id;});
    var students=(c.studentIds||[]).map(function(id){return DB.byId(db.students,id);}).filter(Boolean);
    var avg = subs.length? (subs.reduce(function(a,s){return a+s.score;},0)/subs.length).toFixed(0):'—';
    var html=
      card('📊 班级概览', grid4([
        stat(students.length,'学生人数'), stat(subs.length,'已批改'), stat(avg,'平均正确率%'),
        stat(db.questionBank.length,'题库总量')
      ])) +
      card('🚀 快速入口', '<div class="row">'+
        btn('班级与学生管理','#/teacher/class')+btn('AI 作业批改','#/teacher/grade')+
        btn('题库与分层作业','#/teacher/bank')+btn('学情分析','#/teacher/analytics')+'</div>')+
      card('📌 近期作业', recentHW(c.id));
    return set(html);
  }
  function noClass(){ return set(card('欢迎，'+App.user.name, '<p class="muted">您还没有班级，先去“班级管理”创建一个班级并导入学生吧。</p><div class="row">'+btn('去班级管理','#/teacher/class')+'</div>')); }

  function recentHW(classId){
    var db=DB.get(); var list=db.homework.filter(function(h){return h.classId===classId;}).slice(-3).reverse();
    if(!list.length) return '<p class="muted">暂无作业。</p>';
    return '<div>'+list.map(function(h){ return '<div class="list-item"><div class="avatar">📄</div><div style="flex:1"><b>'+UI.esc(h.title)+'</b><div class="muted">'+h.questions.length+'题 · '+UI.fmtDate(h.publishedAt)+'</div></div><span class="pill ok">已发布</span></div>'; }).join('')+'</div>';
  }

  /* ---------- 班级管理 ---------- */
  function classMgmt(){
    var c=currentClass();
    if(!c){ // 创建班级
      var gradeOpts='', numOpts='';
      var labels=['一','二','三','四','五','六'];
      for(var i=1;i<=6;i++) gradeOpts+='<option value="'+i+'">'+labels[i-1]+'年级</option>';
      for(var i=1;i<=15;i++) numOpts+='<option value="'+i+'">'+i+'班</option>';
      var form='<div class="row">'+
        '<select id="newc-grade" style="max-width:120px">'+gradeOpts+'</select>'+
        '<select id="newc-num" style="max-width:120px">'+numOpts+'</select>'+
        '<button class="btn btn-primary" id="btn-create-class">创建</button></div>';
      return set(card('创建班级', form)+'<p class="muted">选择年级和班级号后自动命名为“五（2）班”等格式。</p>', afterCreate);
    }
    var db=DB.get();
    var students=studentsOf(c,db);
    var rows = students.map(function(s){
      var p = s.parentId? DB.byId(db.parents,s.parentId):null;
      return '<tr><td>'+UI.esc(s.name)+'</td><td>'+s.phone+'</td><td>'+UI.esc(s.studentNo)+'</td>'+
        '<td>'+(p?('<span class="pill ok">已绑定 '+UI.esc(p.name)+'</span>'):'<span class="pill warn">未绑定</span>')+'</td>'+
        '<td>'+points(s.points)+'</td>'+
        '<td><button class="btn btn-sm" data-bind="'+s.id+'">绑家长</button> <button class="btn btn-sm btn-danger" data-delstu="'+s.id+'">移除</button></td></tr>';
    }).join('');
    var html = card('班级与学生管理',
      classSelector(c)+
      '<div class="row"><button class="btn btn-primary" id="btn-import">批量导入学生</button>'+
      '<button class="btn" id="btn-addstu">单个添加</button>'+
      '<span class="muted">格式：姓名,手机号,学号,家长手机号（家长手机号可留空自动生成）</span></div>')+
      card('学生名单（'+students.length+'人）',
        '<table><thead><tr><th>姓名</th><th>手机号</th><th>学号</th><th>家长</th><th>积分</th><th>操作</th></tr></thead><tbody>'+(rows||'<tr><td colspan=6 class="muted">暂无学生</td></tr>')+'</tbody></table>');
    return set(html, afterClass);
  }
  function afterCreate(){
    var btn=document.getElementById('btn-create-class');
    if(btn) btn.onclick=createClass;
    var nameInput=document.getElementById('newc-name');
    if(nameInput) nameInput.onkeydown=function(e){ if(e.key==='Enter') createClass(); };
  }
  function createClass(){
    var grade=parseInt(document.getElementById('newc-grade').value,10)||3;
    var num=parseInt(document.getElementById('newc-num').value,10)||1;
    var labels=['一','二','三','四','五','六'];
    var name=labels[grade-1]+'（'+num+'）班';
    var db=DB.get();
    // 避免同一位教师重复创建同名班级
    var exists=false;
    for(var i=0;i<db.classes.length;i++){ if(db.classes[i].teacherId===App.user.id && db.classes[i].name===name){ exists=true; break; } }
    if(exists){ UI.toast('班级「'+name+'」已存在'); return; }
    var cls={ id:DB.uid('c'), name:name, grade:grade, teacherId:App.user.id, school:App.user.school||'', studentIds:[] };
    db.classes.push(cls);
    DB.save(db);
    App.setCurrentClass(cls.id);
    UI.toast('班级「'+name+'」已创建');
    App.go('#/teacher/class');
  }
  function afterClass(){
    var $ = function(id){ return document.getElementById(id); };
    var b1=$('btn-import'); if(b1) b1.onclick=showImport;
    var b2=$('btn-addstu'); if(b2) b2.onclick=showAddStu;
    var sel=$('class-select'); if(sel){ sel.onchange=function(){ App.setCurrentClass(sel.value); UI.toast('已切换到 '+UI.esc(currentClass().name)); App.render(); }; }
    document.querySelectorAll('[data-bind]').forEach(function(x){ x.onclick=function(){ bindParent(x.getAttribute('data-bind')); }; });
    document.querySelectorAll('[data-delstu]').forEach(function(x){ x.onclick=function(){ delStu(x.getAttribute('data-delstu')); }; });
  }
  function showImport(){
    var body='<p class="muted">每行一个学生，用<b>逗号</b>分隔字段（中英文逗号、制表符、空格均可）：<br>'+
      '<b>姓名, 手机号</b>[, 学号][, 家长手机号]<br>'+
      '· 至少填「姓名 + 手机号」即可；<b>学号、家长手机号可留空</b>，系统自动生成。<br>'+
      '· 学生初始密码统一为 <b>123456</b>。</p>'+
      '<textarea id="imp-text" rows="7" placeholder="王小明,13800000111,2023001,13800000221&#10;李小红,13800000112&#10;张小刚,13800000113,2023003"></textarea>';
    UI.modal({ title:'批量导入学生', body:body, actions:[
      {label:'取消',cls:''},{label:'导入',cls:'btn-primary',onClick:function(close){ if(doImport()) close(); }}
    ]});
  }
  // 返回 true 表示流程结束可关闭弹窗；false 表示保留弹窗让老师修正
  function doImport(){
    var ta=document.getElementById('imp-text'); if(!ta) return true;
    var c=currentClass();
    if(!c){ UI.toast('请先创建班级再导入学生'); return true; }
    var raw=(ta.value||'').replace(/\r/g,'').trim();
    if(!raw){ UI.toast('请先粘贴或输入学生名单'); return false; }
    var lines=raw.split(/\n+/);
    var db=DB.get();
    var added=0, bound=0, skipped=[];
    var seenPhones={}; // 避免同一批内手机号重复
    lines.forEach(function(line, idx){
      var t=line.trim(); if(!t) return; // 跳过空行
      // 分隔符：中英文逗号 / 制表符 / 空格（含全角空格）
      var f=t.split(/[,，\t\u3000 ]+/).map(function(s){return s.trim();}).filter(function(s){return s!=='';});
      var name=f[0], phone=f[1], stuNo=f[2]||'', pPhone=f[3]||'';
      if(!name){ skipped.push('第'+(idx+1)+'行：缺少姓名'); return; }
      if(!Auth.validPhone(phone)){ skipped.push('第'+(idx+1)+'行「'+name+'」：手机号格式不正确（需11位、以1开头）'); return; }
      if(seenPhones[phone]){ skipped.push('第'+(idx+1)+'行「'+name+'」：本批重复手机号 '+phone); return; }
      seenPhones[phone]=1;

      var existing = DB.byPhone(db.users, phone);
      var stu;
      if(existing && existing.role==='student'){
        // 学生已存在（可能自注册过）：复用该账号，加入当前班级，不再新建同名不同 id 的账号
        stu = existing;
        stu.name = name;                       // 教师导入时以教师填的姓名为准
        if(stuNo) stu.studentNo = stuNo;       // 教师填的学号也更新
        if(!stu.classId) stu.classId = c.id;   // 若未绑定班级则绑定
        else if(stu.classId !== c.id){ skipped.push('第'+(idx+1)+'行「'+name+'」：该学生已在其它班级'); return; }
      } else if(existing){
        skipped.push('第'+(idx+1)+'行「'+name+'」：手机号 '+phone+' 已被'+Auth.roleName(existing.role)+'占用'); return;
      } else {
        if(!stuNo) stuNo='S'+String(Date.now()).slice(-6)+idx;
        stu={ id:DB.uid('s'), role:'student', name:name, phone:phone, pwd:'123456',
          studentNo:stuNo, classId:c.id, parentId:null, points:0, grade:c.grade };
        db.users.push(stu); db.students.push(stu);
      }
      // 确保该学生在当前班级的 studentIds 中
      c.studentIds=c.studentIds||[];
      if(c.studentIds.indexOf(stu.id)<0){ c.studentIds.push(stu.id); }
      added++;
      // 家长：留空自动生成，已存在则复用
      var parentPhone = pPhone || ('139'+String(DB.rand(10000000,99999999)));
      var par = DB.byPhone(db.parents, parentPhone);
      if(!par){ par={ id:DB.uid('p'), role:'parent', name:name.slice(0,1)+'家长', phone:parentPhone, pwd:'123456', studentId:stu.id }; db.users.push(par); db.parents.push(par); }
      stu.parentId=par.id; par.studentId=stu.id; bound++;
    });
    DB.save(db);
    App.render();
    if(added===0){
      var reason = skipped.length? ('<div style="max-height:40vh;overflow:auto"><p>本次没有导入任何学生，原因如下：</p><ul style="margin:8px 0 0 18px">'+skipped.map(function(s){return '<li>'+UI.esc(s)+'</li>';}).join('')+'</ul></div>') : '<p>没有可导入的内容，请检查输入。</p>';
      UI.modal({ title:'导入未成功', body:reason, actions:[{label:'我知道了',cls:'btn-primary'}] });
      return false;
    }
    var msg='成功导入 '+added+' 名学生，绑定家长 '+bound+' 个';
    if(skipped.length){
      UI.modal({ title:'导入完成（部分跳过）', body:'<p>'+msg+'。</p><p class="muted">以下 '+skipped.length+' 行被跳过：</p><ul style="margin:8px 0 0 18px;max-height:35vh;overflow:auto">'+skipped.map(function(s){return '<li>'+UI.esc(s)+'</li>';}).join('')+'</ul>', actions:[{label:'完成',cls:'btn-primary'}] });
    } else {
      UI.toast(msg);
    }
    return true;
  }
  function showAddStu(){
    var body='姓名 <input id="as-name"><br><br>手机号 <input id="as-phone" maxlength="11"><br><br>学号 <input id="as-no"><br><br>家长手机号（可空）<input id="as-pp">';
    UI.modal({ title:'单个添加学生', body:body, actions:[
      {label:'取消',cls:''},{label:'添加',cls:'btn-primary',onClick:function(c){ var db=DB.get(),c1=currentClass();
        var name=document.getElementById('as-name').value, phone=document.getElementById('as-phone').value, no=document.getElementById('as-no').value;
        if(!name||!Auth.validPhone(phone)){ UI.toast('请填写姓名和正确手机号'); return; }
        var stu={id:DB.uid('s'),role:'student',name:name,phone:phone,pwd:'123456',studentNo:no||('S'+Date.now()%100000),classId:c1.id,parentId:null,points:0,grade:c1.grade};
        db.users.push(stu); db.students.push(stu); c1.studentIds=c1.studentIds||[]; c1.studentIds.push(stu.id); DB.save(db); UI.toast('已添加'); c(); App.render(); }}
    ]});
  }
  function bindParent(stuId){
    var body='家长手机号 <input id="bp-phone" maxlength="11" placeholder="已有家长账号填手机号，新账号将自动创建"><br><br><span class="muted">留空则自动生成家长账号（密码123456）。</span>';
    UI.modal({ title:'绑定家长', body:body, actions:[
      {label:'取消',cls:''},{label:'绑定',cls:'btn-primary',onClick:function(c){ var db=DB.get(); var stu=DB.byId(db.students,stuId); if(!stu) return;
        var pp=document.getElementById('bp-phone').value.trim();
        var par = pp? DB.byPhone(db.parents,pp) : null;
        if(pp && !par){ par={id:DB.uid('p'),role:'parent',name:stu.name.slice(0,1)+'家长',phone:pp,pwd:'123456',studentId:stu.id}; db.users.push(par); db.parents.push(par); }
        if(!par){ par={id:DB.uid('p'),role:'parent',name:stu.name.slice(0,1)+'家长',phone:'139'+DB.rand(10000000,99999999),pwd:'123456',studentId:stu.id}; db.users.push(par); db.parents.push(par); }
        stu.parentId=par.id; par.studentId=stu.id; DB.save(db); UI.toast('已绑定家长：'+par.phone); c(); App.render(); }}
    ]});
  }
  function delStu(stuId){
    UI.confirm('确定从班级移除该学生？', function(){ var db=DB.get(),c=currentClass();
      c.studentIds=(c.studentIds||[]).filter(function(id){return id!==stuId;});
      var stu=DB.byId(db.students,stuId); if(stu&&stu.parentId){ var p=DB.byId(db.parents,stu.parentId); if(p) p.studentId=null; }
      DB.save(db); UI.toast('已移除'); App.render(); });
  }

  /* ---------- AI 作业批改 ---------- */
  function grading(){
    var c=currentClass(); if(!c) return noClass();
    var db=DB.get();
    var hws=db.homework.filter(function(h){return h.classId===c.id;});
    var opts='<option value="">— 选择作业 —</option>'+hws.map(function(h){return '<option value="'+h.id+'">'+UI.esc(h.title)+'</option>';}).join('');
    var optsStu='<option value="">— 选择学生 —</option>'+studentsOf(c,db).map(function(s){return '<option value="'+s.id+'">'+UI.esc(s.name)+'</option>';}).join('');
    var html = card('AI 作业批改',
      '<div class="row"><label style="flex:1">作业<select id="g-hw">'+opts+'</select></label>'+
      '<label style="flex:1">学生<select id="g-stu">'+optsStu+'</select></label></div>'+
      '<div class="row" style="margin-top:10px"><label class="btn" style="display:inline-block;position:relative;overflow:hidden">📷 上传学生作答图片<input type="file" id="g-file" accept="image/*" hidden></label>'+
      '<span id="g-preview" class="muted"></span></div>'+
      '<div id="g-recognize" style="margin-top:12px"></div>'+
      '<div class="row end" style="margin-top:12px"><button class="btn btn-primary" id="g-publish" disabled>发布成绩</button></div>');
    return set(html, afterGrade);
  }
  function afterGrade(){
    var hwSel=document.getElementById('g-hw'), stuSel=document.getElementById('g-stu'), file=document.getElementById('g-file');
    var state={ recognized:null, hw:null, stu:null, img:null };
    if(file) file.onchange=function(e){
      var f=e.target.files[0]; if(!f) return;
      var r=new FileReader(); r.onload=function(ev){ state.img=ev.target.result;
        document.getElementById('g-preview').innerHTML='<img src="'+state.img+'" style="max-height:120px;border-radius:10px;vertical-align:middle"> 已上传';
        if(hwSel.value && stuSel.value){ runRecognize(state, hwSel.value, stuSel.value); }
        else UI.toast('请先选择作业和学生');
      }; r.readAsDataURL(f);
    };
    hwSel.onchange=stuSel.onchange=function(){ if(hwSel.value&&stuSel.value&&state.img) runRecognize(state, hwSel.value, stuSel.value); };
    window.__gradeState=state;
    document.getElementById('g-publish').onclick=function(){ publishGrade(state); };
  }
  function runRecognize(state, hwId, stuId){
    var db=DB.get(); state.hw=DB.byId(db.homework,hwId); state.stu=DB.byId(db.students,stuId);
    UI.toast('AI 识别中…');
    setTimeout(function(){
      state.recognized = AI.recognize(state.hw);
      var box=document.getElementById('g-recognize');
      box.innerHTML = '<div class="muted" style="margin-bottom:8px">AI 已识别 '+state.recognized.length+' 道题，请核对并修正：</div>'+
        state.hw.questions.map(function(q,i){
          var rec=state.recognized[i];
          return '<div class="q"><div class="q-meta"><span class="tag">'+UI.esc(q.kp)+'</span><span class="tag">'+UI.esc(q.type)+'</span>'+(rec.sure?'':'<span class="pill warn">识别存疑</span>')+'</div>'+
            '<div>'+UI.esc(q.stem)+' <span class="muted">（标准：'+UI.esc(q.answer)+'）</span></div>'+
            '<div style="margin-top:8px">学生作答：<input id="rec-'+i+'" value="'+UI.esc(rec.recognized)+'"></div></div>';
        }).join('');
      document.getElementById('g-publish').disabled=false;
    }, 700);
  }
  function publishGrade(state){
    if(!state.recognized||!state.hw||!state.stu){ UI.toast('请先完成识别'); return; }
    var answers=state.hw.questions.map(function(q,i){
      var val=document.getElementById('rec-'+i).value;
      var g=AI.gradeQuestion(q, val);
      return { qid:q.id, value:val, correct:g.correct, errorType:g.errorType, errorLoc:g.errorLoc, reason:g.reason };
    });
    var correct=answers.filter(function(a){return a.correct;}).length;
    var score=Math.round(correct/answers.length*100);
    var db=DB.get();
    db.submissions.push({ id:DB.uid('sub'), hwId:state.hw.id, studentId:state.stu.id, answers:answers, score:score,
      aiGraded:true, teacherReviewed:true, status:'reviewed', submittedAt:Date.now() });
    // 积分 & 错题库
    var stu=DB.byId(db.students,state.stu.id); stu.points=(stu.points||0)+ (score>=90?10:score>=60?5:2);
    answers.filter(function(a){return !a.correct;}).forEach(function(a){
      db.wrongBook.push({ id:DB.uid('w'), studentId:stu.id, qid:a.qid, hwId:state.hw.id, type:'作业',
        errorType:a.errorType, reason:a.reason, times:1, lastAt:Date.now(), variants:[] });
    });
    DB.save(db);
    UI.toast(stu.name+' 成绩已发布：'+score+'分，+'+((score>=90?10:score>=60?5:2))+'积分');
    App.go('#/teacher/grade');
  }

  /* ---------- 题库管理 ---------- */
  var bankSel=[];
  function bank(){
    var html = card('题库管理 · 苏教版知识点',
      '<div class="row">'+
      '<button class="btn btn-primary" id="bk-ai">AI 联网生成</button>'+
      '<button class="btn" id="bk-kp">按知识点添加</button>'+
      '<button class="btn" id="bk-manual">手动创建</button>'+
      '<button class="btn" id="bk-pub">发布作业</button>'+
      '</div>')+
      card('我的题库（'+DB.get().questionBank.length+'题）', bankTable());
    return set(html, afterBank);
  }
  function bankTable(){
    var list=DB.get().questionBank.slice(-30).reverse();
    return '<div>'+list.map(function(q){
      return '<div class="list-item"><div style="flex:1"><span class="tag">'+q.grade+'年级</span><span class="tag">'+UI.esc(q.kp)+'</span><span class="tag">'+UI.esc(q.type)+'</span><div>'+UI.esc(q.stem)+' = <b>'+UI.esc(q.answer)+'</b></div></div>'+
        '<button class="btn btn-sm" data-pick="'+q.id+'">选入</button> <button class="btn btn-sm btn-danger" data-delq="'+q.id+'">删</button></div>';
    }).join('')+'</div>';
  }
  function afterBank(){
    document.getElementById('bk-ai').onclick=aiGen;
    document.getElementById('bk-kp').onclick=kpAdd;
    document.getElementById('bk-manual').onclick=manualAdd;
    document.getElementById('bk-pub').onclick=publishHW;
    document.querySelectorAll('[data-pick]').forEach(function(x){ x.onclick=function(){ bankSel.push(x.getAttribute('data-pick')); UI.toast('已选入，共'+bankSel.length+'题'); }; });
    document.querySelectorAll('[data-delq]').forEach(function(x){ x.onclick=function(){ var db=DB.get(); db.questionBank=db.questionBank.filter(function(q){return q.id!==x.getAttribute('data-delq');}); DB.save(db); App.render(); }; });
  }
  function aiGen(){
    var kps=uniqueKP();
    var body='年级 <select id="ag-grade">'+[1,2,3,4,5,6].map(function(g){return '<option value="'+g+'">'+g+'年级</option>';}).join('')+'</select> '+
      '知识点 <select id="ag-kp">'+kps.map(function(k){return '<option value="'+k+'">'+k+'</option>';}).join('')+'</select> '+
      '数量 <input id="ag-n" type="number" min="1" max="10" value="5" style="width:70px"><br><br><div id="ag-out"></div>';
    UI.modal({ title:'AI 联网生成题目', body:body, actions:[
      {label:'生成',cls:'btn-primary',onClick:function(){ var g=+document.getElementById('ag-grade').value, k=document.getElementById('ag-kp').value, n=+document.getElementById('ag-n').value;
        var qs=AI.genByKP(g,k,n); var out=document.getElementById('ag-out');
        out.innerHTML=qs.map(function(q){return '<div class="q">'+q.stem+' = <b>'+q.answer+'</b> <button class="btn btn-sm" data-addq="1" onclick="window.__addQ(\''+encodeURIComponent(JSON.stringify(q))+'\')">加入题库</button></div>';}).join('');
      }},
      {label:'完成',cls:'',onClick:function(c){c();App.render();}}
    ]});
  }
  function kpAdd(){
    var kps=DB.KP;
    var body='<div style="max-height:50vh;overflow:auto">'+[1,2,3,4,5,6].map(function(g){
      return '<div style="margin:8px 0"><b>'+g+'年级</b><br>'+kps.filter(function(k){return k.grade===g;}).map(function(k){
        return '<button class="chip" data-addsample="'+encodeURIComponent(JSON.stringify({grade:g,kp:k.name,type:k.type}))+'">'+k.name+'</button>';
      }).join(' ');
    }).join('')+'</div></div>';
    UI.modal({ title:'按知识点添加', body:body, actions:[{label:'完成',cls:'btn-primary',onClick:function(c){c();App.render();}}]});
    document.querySelectorAll('[data-addsample]').forEach(function(x){ x.onclick=function(){
      var o=JSON.parse(decodeURIComponent(x.getAttribute('data-addsample'))); var m=DB.findKP(o.kp).make();
      var db=DB.get(); db.questionBank.push({id:DB.uid('q'),grade:o.grade,kp:o.kp,type:o.type,stem:m.q,answer:String(m.a),options:m.options||null}); DB.save(db); UI.toast('已加入：'+o.kp);
    }; });
  }
  function manualAdd(){
    var kps=uniqueKP();
    var body='年级<input id="ma-g" type="number" min="1" max="6" value="3"><br><br>知识点<input id="ma-kp" list="kplist"><datalist id="kplist">'+kps.map(function(k){return '<option value="'+k+'">';}).join('')+'</datalist><br><br>题型<select id="ma-t">'+['口算','竖式','应用题','填空','选择'].map(function(t){return '<option>'+t+'</option>';}).join('')+'</select><br><br>题干<textarea id="ma-stem"></textarea><br><br>答案<input id="ma-a"><br><br>选项(选择题用,逗号分隔)<input id="ma-o">';
    UI.modal({ title:'手动创建题目', body:body, actions:[
      {label:'取消',cls:''},{label:'保存',cls:'btn-primary',onClick:function(c){ var db=DB.get();
        db.questionBank.push({id:DB.uid('q'),grade:+document.getElementById('ma-g').value,kp:document.getElementById('ma-kp').value,type:document.getElementById('ma-t').value,stem:document.getElementById('ma-stem').value,answer:document.getElementById('ma-a').value,options:document.getElementById('ma-o').value||null}); DB.save(db); UI.toast('已保存'); c(); App.render(); }}
    ]});
  }
  function publishHW(){
    if(!bankSel.length){ UI.toast('请先在题库中点“选入”题目'); return; }
    var db=DB.get(); var c=currentClass(); if(!c){ UI.toast('请先创建班级'); return; }
    var body='发布到：<b>'+UI.esc(c.name)+'</b><br><br>作业标题<input id="ph-title" value="AI分层练习"><br><br>类型<select id="ph-type"><option value="分层作业">分层作业（基础/提高/拓展）</option><option value="课堂练习">课堂练习</option></select><br><br><span class="muted">已选 '+bankSel.length+' 题，将作为基础层发布，可在学生端做分层练习。</span>';
    UI.modal({ title:'发布作业', body:body, actions:[
      {label:'取消',cls:''},{label:'发布',cls:'btn-primary',onClick:async function(c2){ var qs=bankSel.map(function(id){return DB.byId(db.questionBank,id);}).filter(Boolean).map(function(q){return {id:DB.uid('hq'),type:q.type,kp:q.kp,stem:q.stem,answer:q.answer,options:q.options,tier:'base'};});
        db.homework.push({id:DB.uid('hw'),classId:c.id,title:document.getElementById('ph-title').value,grade:c.grade,publishedAt:Date.now(),status:'published',questions:qs}); var sync=await DB.save(db); bankSel=[];
        UI.toast((sync&&sync.ok?'已发布到':'⚠️ 本地已发布，但云端同步失败：')+c.name+(sync&&sync.ok?'':'，请点顶部 🔄 同步重试'), sync&&sync.ok?2600:4200); c2(); App.go('#/teacher/home'); }}
    ]});
  }
  function uniqueKP(){ var s={}; DB.KP.forEach(function(k){ s[k.name]=1; }); return Object.keys(s); }

  /* ---------- 学情分析 ---------- */
  function analytics(){
    var c=currentClass(); if(!c) return noClass();
    var a=AI.classAnalytics(c.id); if(!a) return set(card('学情','无数据'));
    var perRows=a.perStudent.map(function(p){ return '<tr><td>'+UI.esc(p.stu.name)+'</td><td>'+(p.avg==null?'—':p.avg.toFixed(0)+'%')+'</td><td>'+points(p.stu.points)+'</td><td><button class="btn btn-sm" data-stu="'+p.stu.id+'">个人报告</button></td></tr>'; }).join('');
    var errRows=a.topErrors.map(function(e){ return '<tr><td>'+UI.esc(e.kp)+'</td><td><span class="pill err">'+e.n+' 次</span></td><td>'+UI.esc(AI.suggest(e.kp, errRate(e.kp, a)))+'</td></tr>'; }).join('');
    var html = card('📈 班级学情', grid4([
      stat(a.subCount,'批改份数'), stat(a.perStudent.length,'学生人数'),
      stat(avgAll(a),'班级均分%'), stat(a.topErrors.length?'有':'无','高频薄弱点')
    ])) +
    card('👤 学生成绩与积分', '<table><thead><tr><th>姓名</th><th>平均正确率</th><th>积分</th><th>操作</th></tr></thead><tbody>'+(perRows||'<tr><td colspan=4>暂无</td></tr>')+'</tbody></table>') +
    card('🔥 高频错误与 AI 教学建议', '<table><thead><tr><th>知识点</th><th>频次</th><th>建议</th></tr></thead><tbody>'+(errRows||'<tr><td colspan=3 class="muted">暂无错误数据</td></tr>')+'</tbody></table>');
    return set(html, function(){ document.querySelectorAll('[data-stu]').forEach(function(x){ x.onclick=function(){ stuReport(x.getAttribute('data-stu')); }; }); });
  }
  function errRate(kp,a){ var total=a.perStudent.length*2||1; var n=(a.topErrors.find(function(e){return e.kp===kp;})||{}).n||0; return n/total; }
  function avgAll(a){ var v=a.perStudent.filter(function(p){return p.avg!=null;}); if(!v.length) return '—'; return (v.reduce(function(s,p){return s+p.avg;},0)/v.length).toFixed(0); }
  function stuReport(stuId){
    var r=AI.studentReport(stuId);
    var subs=r.subs.slice(-6).reverse().map(function(s){ return '<div class="list-item"><div style="flex:1">作业得分 <b>'+s.score+'分</b><div class="muted">'+UI.fmtDate(s.submittedAt)+'</div></div></div>'; }).join('');
    var body='<p>姓名：<b>'+UI.esc(r.stu.name)+'</b> ｜ 积分：<b>'+r.points+'</b> ｜ 错题：<b>'+r.wrongCount+'</b> ｜ 平均正确率：<b>'+(r.avg==null?'—':r.avg.toFixed(0)+'%')+'</b></p><h3 style="margin-top:14px">最近作业</h3>'+(subs||'<p class="muted">暂无</p>');
    UI.modal({ title:'学生个人报告', body:body, actions:[{label:'关闭',cls:'btn-primary'}] });
  }

  /* ---------- 小工具 ---------- */
  function set(html, after){ var v=document.getElementById('view'); v.innerHTML=html; if(after) after(); return html; }
  function card(t,b){ return '<div class="card"><h3>'+t+'</h3>'+b+'</div>'; }
  function grid4(arr){ return '<div class="grid grid-4">'+arr.join('')+'</div>'; }
  function stat(n,l){ return '<div class="stat"><div class="num">'+n+'</div><div class="lbl">'+l+'</div></div>'; }
  function btn(t,h){ return '<a class="btn btn-primary" href="'+h+'">'+t+'</a>'; }
  function points(n){ return '<span class="points-badge">⭐ '+n+'</span>'; }

  // 全局：AI生成弹窗内“加入题库”
  global.__addQ=function(enc){ var q=JSON.parse(decodeURIComponent(enc)); var db=DB.get(); db.questionBank.push({id:DB.uid('q'),grade:q.grade,kp:q.kp,type:q.type,stem:q.stem,answer:q.answer,options:q.options||null}); DB.save(db); UI.toast('已加入题库'); };

  global.Teacher = { render:render };
})(window);
