/* =========================================================
 * student.js —— 学生端（浅蓝主题）
 * 课堂实时答题 / 积分激励 / 错题本 / 学习报告
 * ========================================================= */
(function (global) {
  'use strict';
  var App=global.App=global.App||{};
  function myClass(){ var db=DB.get(); return db.classes.find(function(c){return c.studentIds&&c.studentIds.indexOf(App.user.id)>=0;}) || (App.user.classId?DB.byId(db.classes,App.user.classId):null); }
  function myHW(){ var c=myClass(); if(!c) return []; var db=DB.get(); return db.homework.filter(function(h){return h.classId===c.id;}); }
  function unreviewed(){ var db=DB.get(); return myHW().filter(function(h){ return !db.submissions.some(function(s){return s.hwId===h.id&&s.studentId===App.user.id;}); }); }

  function render(sub){
    sub=sub||'home';
    if(sub==='home') return home();
    if(sub==='practice') return practice();
    if(sub==='wrong') return wrong();
    if(sub==='report') return report();
    return home();
  }

  function home(){
    var r=AI.studentReport(App.user.id);
    var u=unreviewed();
    var c=myClass();
    var clsInfo = c ? '<span class="muted">班级：'+UI.esc(c.name)+' <span style="font-size:11px">(ID:'+c.id.slice(-6)+')</span></span>' : '<span class="muted" style="color:#d9534f">未加入班级，请联系教师导入</span>';
    var html=card('👋 '+App.user.name+'，加油！ <span class="muted" style="font-size:12px">(ID:'+(App.user.id||'').slice(-6)+')</span>', clsInfo + grid4([
      stat(r.points,'我的积分'), stat(u.length,'待做作业'),
      stat(r.wrongCount,'错题数'), stat(r.avg==null?'—':r.avg.toFixed(0)+'%','平均正确率')
    ])) +
    card('🚀 学习中心', '<div class="row">'+btn('课堂/课后练习','#/student/practice')+btn('我的错题本','#/student/wrong')+btn('学习报告','#/student/report')+'</div>') +
    card('📝 待完成作业', u.length? u.map(function(h){ return '<div class="list-item"><div style="flex:1"><b>'+UI.esc(h.title)+'</b><div class="muted">'+h.questions.length+'题 · '+UI.fmtDate(h.publishedAt)+'</div></div><a class="btn btn-sm btn-primary" href="#/student/practice?hw='+h.id+'">去完成</a></div>'; }).join('') : '<p class="muted">太棒了，作业都完成啦！</p>');
    return set(html);
  }

  /* ---------- 练习 ---------- */
  function practice(){
    var q=parseQs();
    if(q.hw){ return doHW(q.hw); }
    if(q.quiz){ return quiz(); }
    // 列表：我的作业 + AI随堂小测
    var u=unreviewed();
    var hwCards=u.map(function(h){ return '<div class="list-item"><div style="flex:1"><b>'+UI.esc(h.title)+'</b><div class="muted">'+h.questions.length+'题</div></div><a class="btn btn-sm btn-primary" href="#/student/practice?hw='+h.id+'">作答</a></div>'; }).join('');
    var html=card('选择练习', '<div class="row"><a class="btn btn-primary" href="#/student/practice?quiz=1">🤖 AI 随堂小测（生成5题，即时反馈+积分）</a></div>'+
      (hwCards?'<h3 style="margin-top:14px">我的作业</h3>'+hwCards:'<p class="muted" style="margin-top:14px">暂无待完成作业</p>'));
    return set(html);
  }
  function parseQs(){ var m=location.hash.match(/hw=([^&]+)/); var qz=location.hash.indexOf('quiz=1')>=0;
    var hw=m?DB.byId(DB.get().homework,m[1]):null; return {hw:hw,quiz:qz}; }

  function doHW(hw){
    var db=DB.get();
    var answers=hw.questions.map(function(q){ return {qid:q.id, value:'', correct:null}; });
    var body='<p class="muted">'+UI.esc(hw.title)+' · 共'+hw.questions.length+'题，完成后点击“提交作业”。</p><div id="qlist">'+hw.questions.map(function(q,i){ return qBlock(q,i); }).join('')+'</div>'+
      '<div class="row end" style="margin-top:12px"><button class="btn btn-primary" id="submit-hw">提交作业</button></div>';
    var html=card('✍️ 作答：'+UI.esc(hw.title), body);
    return set(html, function(){ bindQFeedback(hw.questions);
      document.getElementById('submit-hw').onclick=function(){ submitHW(hw, answers); };
    });
  }
  function qBlock(q,i){
    return '<div class="q"><div class="q-meta"><span class="tag">'+UI.esc(q.kp)+'</span><span class="tag">'+UI.esc(q.type)+'</span></div>'+
      '<div>'+ (i+1)+'. '+UI.esc(q.stem)+'</div>'+
      '<div style="margin-top:8px">答：<input id="ans-'+i+'" data-i="'+i+'"></div>'+
      '<div id="fb-'+i+'"></div></div>';
  }
  function bindQFeedback(qs){
    qs.forEach(function(q,i){ var inp=document.getElementById('ans-'+i); if(inp) inp.onblur=function(){ liveCheck(q,i,inp.value); }; });
  }
  function liveCheck(q,i,val){
    var g=AI.gradeQuestion(q,val); var fb=document.getElementById('fb-'+i);
    if(!val){ fb.innerHTML=''; return; }
    if(g.correct){ fb.className='feedback ok'; fb.innerHTML='✅ 正确！'; }
    else { fb.className='feedback err'; fb.innerHTML='❌ '+UI.esc(g.errorType)+'：'+UI.esc(g.reason)+' <button class="btn btn-sm" id="ex-'+i+'">📖 详细解析</button>';
      var ex=document.getElementById('ex-'+i); if(ex) ex.onclick=function(){ Analysis.modal(q,{errorType:g.errorType,reason:g.reason,type:q.type,kp:q.kp}); };
    }
  }
  async function submitHW(hw, answers){
    var db=DB.get();
    var res=hw.questions.map(function(q,i){ var val=document.getElementById('ans-'+i).value; var g=AI.gradeQuestion(q,val);
      return {qid:q.id,value:val,correct:g.correct,errorType:g.errorType,errorLoc:g.errorLoc,reason:g.reason}; });
    var correct=res.filter(function(a){return a.correct;}).length; var score=Math.round(correct/res.length*100);
    db.submissions.push({id:DB.uid('sub'),hwId:hw.id,studentId:App.user.id,answers:res,score:score,aiGraded:true,teacherReviewed:false,status:'submitted',submittedAt:Date.now()});
    var gain=score>=90?10:score>=60?5:2; DB.addPoints(db, App.user.id, gain); // v2.22：同时写 users（云端权威）与 students
    res.filter(function(a){return !a.correct;}).forEach(function(a){ var q=DB.byId(hw.questions,a.qid); db.wrongBook.push({id:DB.uid('w'),studentId:App.user.id,qid:a.qid,hwId:hw.id,type:'作业',errorType:a.errorType,reason:a.reason,times:1,lastAt:Date.now(),variants:[],analysis:(global.Analysis?Analysis.build({errorType:a.errorType,reason:a.reason,type:q?q.type:null,kp:q?q.kp:null},q):null)}); });
    UI.toast('正在保存到云端…', 2000);
    var sync = await DB.save(db);
    if(sync && sync.ok){
      UI.toast('作业提交成功！'+score+'分，+'+gain+'积分（已同步）');
    } else {
      UI.toast('⚠️ 作业已保存在本机，云端同步失败：'+((sync&&sync.errMsg)||'未知原因，请点顶部 🔄 同步重试'), 7000);
    }
    App.go('#/student/report');
  }

  function quiz(){
    var db=DB.get(); var g=App.user.grade||3;
    var qs=AI.genByKP(g,null,5);
    var html=card('🤖 AI 随堂小测', '<p class="muted">实时答题，交卷后看成绩与讲解。答对一题 +2 积分。</p><div id="qlist">'+qs.map(function(q,i){return qBlock(q,i);}).join('')+'</div>'+
      '<div class="row end" style="margin-top:12px"><button class="btn btn-primary" id="quiz-submit">交卷</button></div>');
    return set(html, function(){
      qs.forEach(function(q,i){ var inp=document.getElementById('ans-'+i); if(inp) inp.onblur=function(){ liveCheck(q,i,inp.value); }; });
      document.getElementById('quiz-submit').onclick=async function(){ var correct=0; qs.forEach(function(q,i){ var val=document.getElementById('ans-'+i).value; var g2=AI.gradeQuestion(q,val); if(g2.correct) correct++; });
        var score=Math.round(correct/qs.length*100); var gain=correct*2; DB.addPoints(db, App.user.id, gain); var sync=await DB.save(db);
        UI.toast(sync&&sync.ok ? ('小测完成：'+score+'分，+'+gain+'积分') : ('⚠️ 小测已保存本机，云端同步失败：'+((sync&&sync.errMsg)||'请点顶部 🔄 同步重试')), sync&&sync.ok?2600:7000); App.render(); };
    });
  }

  /* ---------- 错题本 ---------- */
  function wrong(){
    var db=DB.get(); var wbs=db.wrongBook.filter(function(w){return w.studentId===App.user.id;});
    if(!wbs.length) return set(card('📒 我的错题本','<p class="muted">还没有错题，继续保持！</p>'));
    var rows=wbs.map(function(w){ var q=AI.findQ(w.hwId,w.qid); var stem=q?q.stem:'（原题已归档）'; var ans=q?q.answer:'';
      return '<div class="q"><div class="q-meta"><span class="pill err">'+UI.esc(w.errorType)+'</span><span class="muted">'+UI.fmtDate(w.lastAt)+'</span></div>'+
        '<div>题目：'+UI.esc(stem)+' <span class="muted">(答案：'+UI.esc(ans)+')</span></div>'+
        '<div class="muted" style="margin-top:4px">我的错误原因：'+UI.esc(w.reason||'—')+'</div>'+
        '<div class="row" style="margin-top:8px"><button class="btn btn-sm" data-variant="'+w.id+'">📐 同类变式</button>'+(global.Analysis?Analysis.toggleHTML(w):'')+'</div>'+
        '<div id="var-'+w.id+'"></div></div>';
    }).join('');
    var html=card('📒 我的错题本（'+wbs.length+'道）', rows);
    return set(html, function(){
      document.querySelectorAll('[data-variant]').forEach(function(x){ x.onclick=function(){ var w=DB.byId(db.wrongBook,x.getAttribute('data-variant')); var q=AI.findQ(w.hwId,w.qid); if(!q){UI.toast('原题不可用');return;} var v=AI.variant(q); if(!v){UI.toast('暂无可推送变式');return;}
        document.getElementById('var-'+w.id).innerHTML='<div class="q" style="margin-top:8px"><b>变式题：</b>'+UI.esc(v.stem)+'<div style="margin-top:6px">答：<input id="vans-'+w.id+'"> <button class="btn btn-sm" id="vchk-'+w.id+'">验证</button></div><div id="vfb-'+w.id+'"></div></div>';
        document.getElementById('vchk-'+w.id).onclick=function(){ var g=AI.gradeQuestion(v,document.getElementById('vans-'+w.id).value); var fb=document.getElementById('vfb-'+w.id); if(g.correct){fb.className='feedback ok';fb.innerHTML='✅ 掌握啦！';} else {fb.className='feedback err';fb.innerHTML='❌ '+UI.esc(g.reason)+' <button class="btn btn-sm" id="vdx-'+w.id+'">📖 详细解析</button>'; var bx=document.getElementById('vdx-'+w.id); if(bx) bx.onclick=function(){ Analysis.modal(v,{errorType:g.errorType,reason:g.reason,type:v.type,kp:v.kp}); };} };
      }; });
    });
  }

  /* ---------- 学习报告 ---------- */
  function report(){
    var r=AI.studentReport(App.user.id);
    var subs=r.subs.slice(-8).reverse().map(function(s){ return '<div class="list-item"><div style="flex:1">作业 <b>'+s.score+'分</b><div class="muted">'+UI.fmtDate(s.submittedAt)+' · '+(s.status==='reviewed'?'教师已复核':'待复核')+'</div></div></div>'; }).join('');
    var html=card('📊 我的学习报告',
      grid4([stat(r.points,'积分'),stat(r.wrongCount,'错题'),stat(r.subs.length,'作业数'),stat(r.avg==null?'—':r.avg.toFixed(0)+'%','平均正确率')]) )+
      card('最近作业记录', subs||'<p class="muted">暂无作业记录</p>')+
      card('老师/家长寄语', '<p class="muted">坚持用数学的眼光观察生活，用数学的语言表达想法，你一定越来越棒！</p>');
    return set(html);
  }

  /* 工具 */
  function set(html, after){ var v=document.getElementById('view'); v.innerHTML=html; if(after) after(); return html; }
  function card(t,b){ return '<div class="card"><h3>'+t+'</h3>'+b+'</div>'; }
  function grid4(a){ return '<div class="grid grid-4">'+a.join('')+'</div>'; }
  function stat(n,l){ return '<div class="stat"><div class="num">'+n+'</div><div class="lbl">'+l+'</div></div>'; }
  function btn(t,h){ return '<a class="btn btn-primary" href="'+h+'">'+t+'</a>'; }
  function escJs(s){ return (s||'').replace(/'/g,'\\\'').replace(/\n/g,' '); }

  global.Student={ render:render };
})(window);
